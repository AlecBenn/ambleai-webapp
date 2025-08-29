// lib/places-verification.js - Google Places API (New) verification utilities

/**
 * Verifies a place using Google Places API Text Search (New)
 * @param {Object} place - The place object from LLM response
 * @param {string} city - The city context for the search
 * @returns {Promise<Object>} Verification result with place details
 */
export async function verifyPlace(place, city) {
  try {
    // Construct search query - combine place name with city for better accuracy
    const searchQuery = `${place.name} ${city}`;

    const requestBody = {
      textQuery: searchQuery,
      // Remove locationBias since Gemini won't provide coordinates anymore
      maxResultCount: 5, // Increased to get more options
      languageCode: 'en',
      regionCode: 'US',
    };

    console.log('Places API request:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask':
            'places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.businessStatus,places.types,places.id,places.photos',
        },
        body: JSON.stringify(requestBody),
      },
    );

    console.log('Places API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Places API error for "${place.name}":`,
        response.status,
        errorText,
      );
      return {
        verified: false,
        error: `API Error: ${response.status} - ${errorText}`,
        originalPlace: place,
        confidence: 0,
      };
    }

    const data = await response.json();
    console.log('Places API response data:', JSON.stringify(data, null, 2));

    if (!data.places || data.places.length === 0) {
      return {
        verified: false,
        error: 'No matching places found',
        originalPlace: place,
        confidence: 0,
      };
    }

    // Find the best match from results
    const bestMatch = findBestMatch(place, data.places, city);

    const isVerified = bestMatch.confidence > 0.3; // Lowered threshold since we don't have location data to match

    console.log(
      `Verification for "${place.name}": ${isVerified ? 'VERIFIED' : 'UNVERIFIED'} (${(bestMatch.confidence * 100).toFixed(1)}% confidence)`,
    );

    return {
      verified: isVerified,
      confidence: bestMatch.confidence,
      originalPlace: place,
      verifiedPlace: bestMatch.place,
      alternativeMatches: data.places.slice(0, 3), // Include up to 3 alternatives
      error: null,
    };
  } catch (error) {
    console.error(`Error verifying place "${place.name}":`, error);
    return {
      verified: false,
      error: error.message,
      originalPlace: place,
      confidence: 0,
    };
  }
}

/**
 * Finds the best matching place from Google Places API results
 * @param {Object} originalPlace - Original place from LLM
 * @param {Array} apiResults - Results from Google Places API
 * @param {string} city - City context
 * @returns {Object} Best match with confidence score
 */
function findBestMatch(originalPlace, apiResults, city) {
  let bestMatch = {
    place: null,
    confidence: 0,
  };

  for (const apiPlace of apiResults) {
    const confidence = calculateMatchConfidence(originalPlace, apiPlace, city);

    if (confidence > bestMatch.confidence) {
      bestMatch = {
        place: {
          id: apiPlace.id,
          name: apiPlace.displayName?.text || apiPlace.displayName,
          address: apiPlace.formattedAddress,
          location: {
            lat: apiPlace.location?.latitude,
            lng: apiPlace.location?.longitude,
          },
          rating: apiPlace.rating,
          userRatingCount: apiPlace.userRatingCount,
          businessStatus: apiPlace.businessStatus,
          types: apiPlace.types || [],
          place_id: apiPlace.id,
          photos: apiPlace.photos || [],
        },
        confidence: confidence,
      };
    }
  }

  return bestMatch;
}

/**
 * Calculates confidence score for place matching
 * @param {Object} originalPlace - Original place from LLM
 * @param {Object} apiPlace - Place from Google Places API
 * @param {string} city - City context
 * @returns {number} Confidence score between 0 and 1
 */
function calculateMatchConfidence(originalPlace, apiPlace, city) {
  let confidence = 0;

  // Enhanced name similarity (60% weight - increased since no location matching)
  const originalName = originalPlace.name.toLowerCase();
  const apiName = (
    apiPlace.displayName?.text ||
    apiPlace.displayName ||
    ''
  ).toLowerCase();

  // Check for exact match first
  if (originalName === apiName) {
    confidence += 0.6;
  } else {
    // Check if one name contains the other (common for translations/variations)
    const containsMatch =
      originalName.includes(apiName) || apiName.includes(originalName);
    if (containsMatch) {
      confidence += 0.5;
    } else {
      // Use Levenshtein distance for partial matches
      const nameSimilarity = calculateStringSimilarity(originalName, apiName);
      confidence += nameSimilarity * 0.6;
    }

    // Bonus for common name patters (e.g., "Museum" vs "Museu")
    const nameWords = originalName
      .split(/[\s\(\)]+/)
      .filter((w) => w.length > 2);
    const apiWords = apiName.split(/[\s\(\)]+/).filter((w) => w.length > 2);

    let wordMatches = 0;
    for (const word of nameWords) {
      if (
        apiWords.some(
          (apiWord) =>
            word.includes(apiWord) ||
            apiWord.includes(word) ||
            calculateStringSimilarity(word, apiWord) > 0.8,
        )
      ) {
        wordMatches++;
      }
    }

    if (nameWords.length > 0) {
      const wordMatchRatio = wordMatches / nameWords.length;
      confidence += wordMatchRatio * 0.15; // Bonus for word matches
    }
  }

  // Address/City matching (30% weight - increased importance)
  const apiAddress = apiPlace.formattedAddress || '';
  const cityInAddress = apiAddress.toLowerCase().includes(city.toLowerCase());
  if (cityInAddress) {
    confidence += 0.3;
  } else {
    // Partial credit for country/region match
    const countryMatch =
      apiAddress.toLowerCase().includes('portugal') ||
      apiAddress.toLowerCase().includes('lisboa') ||
      apiAddress.toLowerCase().includes('lisbon');
    if (countryMatch) {
      confidence += 0.15;
    }
  }

  // Business status (5% weight) - prefer operational places
  if (apiPlace.businessStatus === 'OPERATIONAL') {
    confidence += 0.05;
  } else if (apiPlace.businessStatus === 'CLOSED_TEMPORARILY') {
    confidence += 0.025;
  }

  // Bonus for high-quality places (5% weight)
  if (apiPlace.rating && apiPlace.rating >= 4.0) {
    confidence += 0.03;
  }
  if (apiPlace.userRatingCount && apiPlace.userRatingCount >= 1000) {
    confidence += 0.02;
  }

  return Math.min(confidence, 1); // Cap at 1.0
}

/**
 * Calculates string similarity using Levenshtein distance
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score between 0 and 1
 */
function calculateStringSimilarity(str1, str2) {
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  const matrix = [];

  // Initialize matrix
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  const maxLength = Math.max(str1.length, str2.length);
  const distance = matrix[str2.length][str1.length];
  return 1 - distance / maxLength;
}

/**
 * Verifies all places in a route response
 * @param {Object} routeResponse - The complete route response from LLM
 * @returns {Promise<Object>} Verification results for all places
 */
export async function verifyAllPlaces(routeResponse) {
  if (!routeResponse.places || !Array.isArray(routeResponse.places)) {
    return {
      success: false,
      error: 'Invalid route response format',
    };
  }

  const city = routeResponse.city;
  const verificationPromises = routeResponse.places.map((place) =>
    verifyPlace(place, city),
  );

  try {
    const verificationResults = await Promise.all(verificationPromises);

    const verifiedCount = verificationResults.filter(
      (result) => result.verified,
    ).length;
    const totalCount = verificationResults.length;

    return {
      success: true,
      verificationResults,
      summary: {
        totalPlaces: totalCount,
        verifiedPlaces: verifiedCount,
        verificationRate: (verifiedCount / totalCount) * 100,
        unverifiedPlaces: totalCount - verifiedCount,
      },
      enhancedPlaces: verificationResults.map((result) => ({
        // Original data from Gemini
        name: result.originalPlace.name,
        type: result.originalPlace.type,
        description: result.originalPlace.description,
        reasoning: result.originalPlace.reasoning,
        // Verified data from Google Places API
        address: result.verifiedPlace?.address || 'Address not found',
        location: result.verifiedPlace?.location || null,
        place_id: result.verifiedPlace?.place_id || null,
        rating: result.verifiedPlace?.rating || null,
        userRatingCount: result.verifiedPlace?.userRatingCount || null,
        businessStatus: result.verifiedPlace?.businessStatus || null,
        types: result.verifiedPlace?.types || [],
        photos: result.verifiedPlace?.photos || [],
        verification: {
          verified: result.verified,
          confidence: result.confidence,
          error: result.error,
          verifiedData: result.verifiedPlace,
          alternatives: result.alternativeMatches,
        },
      })),
    };
  } catch (error) {
    console.error('Error during batch verification:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}
