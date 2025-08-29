// lib/gemini.js - Prompt template and client setup
import { verifyAllPlaces } from './places-verification.js';
import {
  optimizeRouteOrder,
  generateOptimizedMapsUrl,
} from './routes-optimization.js';

/**
 * Builds a structured prompt instructing Gemini to output strict JSON.
 */
export function createTravelPrompt(userInput) {
  return `You are a travel expert creating walking itineraries. 

  USER REQUEST: "${userInput}"

  Recommend 5-7 walkable places matching their interests. Focus on:
  - Actually walkable distances
  - Real, public places that exist
  - Mix of attractions based on user preferences

  RULES:
  1. Extract city from input
  2. If "avoiding crowds" mentioned, suggest lesser-known places
  3. Only real places (we will verify addresses separately)
  4. CRITICAL: Return ONLY valid JSON, no markdown blocks
  5. If the user specifies the starting point, make sure to include it as the first place in the JSON
  6. If the user specifies the ending point, make sure to include it as the last place in the JSON
  7. If the user specifies the number of places, make sure to include that many places in the JSON
  8. If the user specifies a certain stop they definitely want to make, make sure to include it in the JSON
  9. If the user specifies the number of stops they want to make, make sure to include that many places in the JSON
  10. If the user specifies more than 13 places, make sure to only include 13 places and warn them that google does not allow more than 13 stops.

  REQUIRED JSON FORMAT:

  {
    "city": "city name",
    "places": [
      {
        "name": "exact place name",
        "type": "restaurant/museum/park/etc",
        "description": "brief description",
        "reasoning": "why it fits request"
      }
    ],
    "total_estimated_walking_time": "estimated time",
    "notes": "route considerations"
  }

  Return only the JSON:`;
}

// Utility function to generate Google Maps URL with waypoints
export function generateGoogleMapsUrl(places, travelMode = 'walking') {
  if (!places || places.length === 0) {
    return null;
  }

  // URL encode function for special characters
  const urlEncode = (str) => {
    return encodeURIComponent(str)
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A');
  };

  // Base URL for Google Maps directions
  let url = 'https://www.google.com/maps/dir/?api=1';

  // Set travel mode
  const modeMap = {
    WALK: 'walking',
    walking: 'walking',
    DRIVE: 'driving',
    driving: 'driving',
    TRANSIT: 'transit',
    transit: 'transit',
    BICYCLE: 'bicycling',
    bicycling: 'bicycling',
  };

  const googleTravelMode = modeMap[travelMode] || 'walking';
  url += `&travelmode=${googleTravelMode}`;

  // Set origin (first place)
  const origin = places[0];
  if (origin.address) {
    url += `&origin=${urlEncode(origin.address)}`;
  } else if (origin.location) {
    url += `&origin=${origin.location.lat}%2C${origin.location.lng}`;
  }

  // Set destination (last place)
  const destination = places[places.length - 1];
  if (destination.address) {
    url += `&destination=${urlEncode(destination.address)}`;
  } else if (destination.location) {
    url += `&destination=${destination.location.lat}%2C${destination.location.lng}`;
  }

  // Set waypoints (intermediate places)
  if (places.length > 2) {
    const waypoints = places.slice(1, -1);
    const waypointStrings = waypoints
      .map((place) => {
        if (place.address) {
          return urlEncode(place.address);
        } else if (place.location) {
          return `${place.location.lat}%2C${place.location.lng}`;
        }
        return '';
      })
      .filter((wp) => wp !== '');

    if (waypointStrings.length > 0) {
      url += `&waypoints=${waypointStrings.join('%7C')}`;
    }
  }

  // Add place IDs if available
  const placeIds = places
    .map((place) => place.place_id)
    .filter((id) => id !== null && id !== undefined);
  if (placeIds.length > 0) {
    // For origin place ID
    if (places[0].place_id) {
      url += `&origin_place_id=${places[0].place_id}`;
    }

    // For destination place ID
    if (places[places.length - 1].place_id) {
      url += `&destination_place_id=${places[places.length - 1].place_id}`;
    }

    // For waypoint place IDs
    if (places.length > 2) {
      const waypointPlaceIds = places
        .slice(1, -1)
        .map((place) => place.place_id)
        .filter((id) => id !== null && id !== undefined);

      if (waypointPlaceIds.length > 0) {
        url += `&waypoint_place_ids=${waypointPlaceIds.join('%7C')}`;
      }
    }
  }

  // Add UTM parameters for tracking
  url += '&utm_source=ai_travel_planner&utm_campaign=walking_route_generation';

  // Check URL length limit (Google Maps URLs are limited to 2,048 characters)
  if (url.length > 2048) {
    console.warn(
      'Google Maps URL exceeds 2048 character limit, truncating waypoints',
    );
    // Fallback: create simpler URL with just origin and destination
    let simpleUrl = 'https://www.google.com/maps/dir/?api=1';
    simpleUrl += `&travelmode=${googleTravelMode}`;

    if (origin.address) {
      simpleUrl += `&origin=${urlEncode(origin.address)}`;
    } else if (origin.location) {
      simpleUrl += `&origin=${origin.location.lat}%2C${origin.location.lng}`;
    }

    if (destination.address) {
      simpleUrl += `&destination=${urlEncode(destination.address)}`;
    } else if (destination.location) {
      simpleUrl += `&destination=${destination.location.lat}%2C${destination.location.lng}`;
    }

    simpleUrl +=
      '&utm_source=ai_travel_planner&utm_campaign=walking_route_generation';
    return simpleUrl;
  }

  return url;
}

// Gemini client setup
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Orchestrates: prompt -> Gemini JSON -> validation -> Places verification ->
 * route optimization -> final response (with Google Maps URL).
 */
export async function generatePlaces(userInput) {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-preview-05-20',
      generationConfig: {
        temperature: 0.3,
        topK: 1,
        maxOutputTokens: 8192,
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
      ],
    });

    const prompt = createTravelPrompt(userInput);
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Parse JSON response
    try {
      // Clean the response text by removing markdown code blocks if present
      let cleanedText = text.trim();

      // Remove markdown code block formatting if present
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText
          .replace(/^```json\s*/, '')
          .replace(/\s*```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      console.log('Cleaned text from Gemini:', cleanedText);

      // Check if the JSON appears to be truncated
      if (
        !cleanedText.includes('"total_estimated_walking_time"') ||
        !cleanedText.trim().endsWith('}')
      ) {
        console.error('JSON appears to be truncated:', cleanedText);
        return {
          success: false,
          error:
            'AI response was truncated. Please try a shorter or more specific request.',
          rawResponse: text,
        };
      }

      const jsonResponse = JSON.parse(cleanedText);

      // Validate the response has required fields
      if (
        !jsonResponse.city ||
        !jsonResponse.places ||
        !Array.isArray(jsonResponse.places)
      ) {
        throw new Error(
          'Response missing required fields (city, places array)',
        );
      }

      // Validate each place has required basic data
      for (let i = 0; i < jsonResponse.places.length; i++) {
        const place = jsonResponse.places[i];
        if (!place.name || !place.type) {
          throw new Error(
            `Place ${i + 1} missing required basic data (name, type)`,
          );
        }
      }

      // NEW: Verify places using Google Places API to get real addresses
      console.log('Starting place verification and address lookup...');
      const verificationResult = await verifyAllPlaces(jsonResponse);

      if (!verificationResult.success) {
        console.error('Place verification failed:', verificationResult.error);
        return {
          success: false,
          error:
            'Failed to verify places with Google Places API: ' +
            verificationResult.error,
        };
      }

      // Only return places that were successfully verified
      const verifiedPlaces = verificationResult.enhancedPlaces.filter(
        (place) => place.verification && place.verification.verified,
      );

      if (verifiedPlaces.length === 0) {
        return {
          success: false,
          error:
            'No places could be verified. Please try a different search or be more specific.',
        };
      }

      // NEW: Optimize route order using Google Routes API
      console.log('Starting route optimization...');
      const optimizationResult = await optimizeRouteOrder(
        verifiedPlaces,
        jsonResponse.route_preferences?.travel_mode || 'WALK',
      );

      let finalPlaces = verifiedPlaces;
      let optimizedMapsUrl = null;
      let routeOptimization = null;

      if (optimizationResult.success && optimizationResult.optimized) {
        console.log('Route optimization successful, using optimized order');
        finalPlaces = optimizationResult.places;
        routeOptimization = optimizationResult.optimization;

        // Generate optimized Google Maps URL
        optimizedMapsUrl = generateOptimizedMapsUrl(
          finalPlaces,
          jsonResponse.route_preferences?.travel_mode || 'WALK',
        );
      } else {
        console.log(
          'Route optimization not performed or failed:',
          optimizationResult.message,
        );

        // Generate standard Google Maps URL with original order
        optimizedMapsUrl = generateGoogleMapsUrl(
          finalPlaces,
          jsonResponse.route_preferences?.travel_mode || 'WALK',
        );
      }

      const finalResponse = {
        ...jsonResponse,
        places: finalPlaces,
        verification: verificationResult.summary,
        optimization: routeOptimization,
      };

      // Use the optimized Maps URL
      finalResponse.google_maps_url = optimizedMapsUrl;

      console.log(
        `Place verification completed: ${verificationResult.summary.verifiedPlaces}/${verificationResult.summary.totalPlaces} places verified`,
      );

      if (routeOptimization) {
        console.log(
          `Route optimization completed: ${routeOptimization.estimatedWalkingTime || 'unknown time'}`,
        );
      }

      return {
        success: true,
        data: finalResponse,
        googleRoutesPayload: convertToGoogleRoutesFormat(finalResponse),
        verification: verificationResult,
        optimization: optimizationResult,
      };
    } catch (parseError) {
      console.error('Failed to parse Gemini JSON response:', text);
      console.error('Parse error details:', parseError.message);
      return {
        success: false,
        error: `Invalid JSON response from AI: ${parseError.message}`,
        rawResponse: text,
      };
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Utility function to convert Gemini response to Google Routes API format
export function convertToGoogleRoutesFormat(geminiResponse) {
  // Filter out places without location data
  const placesWithLocation = geminiResponse.places.filter(
    (place) => place.location && place.location.lat && place.location.lng,
  );

  if (placesWithLocation.length < 2) {
    console.warn('Not enough places with location data for route generation');
    return null;
  }

  const waypoints = placesWithLocation.map((place) => ({
    location: {
      latLng: {
        latitude: place.location.lat,
        longitude: place.location.lng,
      },
    },
    via: false,
    vehicleStopover: false,
    sideOfRoad: false,
  }));

  // First location is origin, last is destination, middle ones are intermediate waypoints
  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const intermediates = waypoints.slice(1, -1);

  return {
    origin: origin.location,
    destination: destination.location,
    intermediates: intermediates.map((wp) => ({ location: wp.location })),
    travelMode: geminiResponse.route_preferences?.travel_mode || 'WALK',
    routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
    computeAlternativeRoutes: false,
    avoidHighways: geminiResponse.route_preferences?.avoid_highways || true,
    avoidTolls: geminiResponse.route_preferences?.avoid_tolls || true,
    optimizeWaypointOrder: geminiResponse.route_preferences?.optimize || true,
    requestedReferenceTime: new Date().toISOString(),

    languageCode: 'en-US',
    units: 'METRIC',
  };
}
