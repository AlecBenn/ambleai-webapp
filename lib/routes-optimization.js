// lib/routes-optimization.js - Google Routes API integration for waypoint optimization

/**
 * Optimizes the order of waypoints using Google Routes API
 * @param {Array} places - Array of verified places with place_id
 * @param {string} travelMode - Travel mode (WALK, DRIVE, TRANSIT, BICYCLE)
 * @returns {Promise<Object>} Optimized route with reordered places
 */
export async function optimizeRouteOrder(places, travelMode = 'WALK') {
  try {
    // Validate input
    if (!places || places.length < 2) {
      throw new Error('At least 2 places are required for route optimization');
    }

    // Filter places that have place_id
    const placesWithIds = places.filter((place) => place.place_id);

    if (placesWithIds.length < 2) {
      console.warn(
        'Not enough places with place_id for optimization, returning original order',
      );
      return {
        success: true,
        optimized: false,
        places: places,
        message: 'Insufficient place IDs for optimization',
      };
    }

    // If only 2 places, no optimization needed
    if (placesWithIds.length === 2) {
      return {
        success: true,
        optimized: false,
        places: placesWithIds,
        message: 'Only 2 places, no optimization needed',
      };
    }

    // Prepare the Routes API request
    const origin = placesWithIds[0];
    const destination = placesWithIds[placesWithIds.length - 1];
    const intermediates = placesWithIds.slice(1, -1);

    const requestBody = {
      origin: {
        placeId: origin.place_id,
      },
      destination: {
        placeId: destination.place_id,
      },
      intermediates: intermediates.map((place) => ({
        placeId: place.place_id,
        via: false,
      })),
      travelMode: travelMode,
      optimizeWaypointOrder: true,
      computeAlternativeRoutes: false,
      languageCode: 'en-US',
      units: 'METRIC',
    };

    // Only add routingPreference for DRIVE and TRANSIT modes
    if (travelMode === 'DRIVE' || travelMode === 'TRANSIT') {
      requestBody.routingPreference = 'TRAFFIC_UNAWARE';
    }

    // Only add routeModifiers for DRIVE mode
    if (travelMode === 'DRIVE') {
      requestBody.routeModifiers = {
        avoidTolls: true,
        avoidHighways: false,
        avoidFerries: false,
      };
    }

    console.log(
      'Routes API optimization request:',
      JSON.stringify(requestBody, null, 2),
    );

    const response = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask':
            'routes.optimizedIntermediateWaypointIndex,routes.duration,routes.distanceMeters,routes.legs',
        },
        body: JSON.stringify(requestBody),
      },
    );

    console.log('Routes API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Routes API error:', response.status, errorText);

      // Return original order if optimization fails
      return {
        success: true,
        optimized: false,
        places: placesWithIds,
        error: `Routes API error: ${response.status} - ${errorText}`,
        message: 'Optimization failed, using original order',
      };
    }

    const data = await response.json();
    console.log('Routes API response data:', JSON.stringify(data, null, 2));

    if (!data.routes || data.routes.length === 0) {
      return {
        success: true,
        optimized: false,
        places: placesWithIds,
        error: 'No routes returned from API',
        message: 'Optimization failed, using original order',
      };
    }

    const route = data.routes[0];

    // Check if optimization was performed
    if (!route.optimizedIntermediateWaypointIndex) {
      return {
        success: true,
        optimized: false,
        places: placesWithIds,
        message: 'No optimization performed by API',
      };
    }

    // Reorder the places based on optimization
    const optimizedOrder = route.optimizedIntermediateWaypointIndex;
    const reorderedIntermediates = optimizedOrder.map(
      (index) => intermediates[index],
    );

    // Construct the final optimized places array
    const optimizedPlaces = [origin, ...reorderedIntermediates, destination];

    // Calculate route statistics
    const totalDuration = route.duration
      ? parseInt(route.duration.replace('s', ''))
      : null;
    const totalDistance = route.distanceMeters || null;

    console.log(`Route optimization completed: ${optimizedOrder.join(' -> ')}`);
    console.log(
      `Total duration: ${totalDuration ? Math.round(totalDuration / 60) : 'unknown'} minutes`,
    );
    console.log(
      `Total distance: ${totalDistance ? Math.round((totalDistance / 1000) * 100) / 100 : 'unknown'} km`,
    );

    return {
      success: true,
      optimized: true,
      places: optimizedPlaces,
      optimization: {
        // originalOrder is the index mapping of intermediates before optimization
        originalOrder: intermediates.map((_, index) => index),
        optimizedOrder: optimizedOrder,
        totalDuration: totalDuration,
        totalDistance: totalDistance,
        estimatedWalkingTime: totalDuration
          ? `${Math.round(totalDuration / 60)} minutes`
          : null,
      },
      routeData: {
        duration: route.duration,
        distanceMeters: route.distanceMeters,
        legs: route.legs,
      },
    };
  } catch (error) {
    console.error('Error optimizing route order:', error);

    // Return original order if optimization fails
    return {
      success: true,
      optimized: false,
      places: places,
      error: error.message,
      message: 'Optimization failed, using original order',
    };
  }
}

/**
 * Generates an optimized Google Maps URL with the reordered waypoints
 * @param {Array} optimizedPlaces - Array of places in optimized order
 * @param {string} travelMode - Travel mode for the URL
 * @returns {string} Google Maps URL with optimized route
 */
export function generateOptimizedMapsUrl(
  optimizedPlaces,
  travelMode = 'walking',
) {
  if (!optimizedPlaces || optimizedPlaces.length === 0) {
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
  const origin = optimizedPlaces[0];
  if (origin.address) {
    url += `&origin=${urlEncode(origin.address)}`;
  } else if (origin.location) {
    url += `&origin=${origin.location.lat}%2C${origin.location.lng}`;
  }

  // Set destination (last place)
  const destination = optimizedPlaces[optimizedPlaces.length - 1];
  if (destination.address) {
    url += `&destination=${urlEncode(destination.address)}`;
  } else if (destination.location) {
    url += `&destination=${destination.location.lat}%2C${destination.location.lng}`;
  }

  // Set waypoints (intermediate places)
  if (optimizedPlaces.length > 2) {
    const waypoints = optimizedPlaces.slice(1, -1);
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

  // Add place IDs if available (this enhances accuracy)
  const placeIds = optimizedPlaces
    .map((place) => place.place_id)
    .filter((id) => id !== null && id !== undefined);
  if (placeIds.length > 0) {
    // For origin place ID
    if (optimizedPlaces[0].place_id) {
      url += `&origin_place_id=${optimizedPlaces[0].place_id}`;
    }

    // For destination place ID
    if (optimizedPlaces[optimizedPlaces.length - 1].place_id) {
      url += `&destination_place_id=${optimizedPlaces[optimizedPlaces.length - 1].place_id}`;
    }

    // For waypoint place IDs
    if (optimizedPlaces.length > 2) {
      const waypointPlaceIds = optimizedPlaces
        .slice(1, -1)
        .map((place) => place.place_id)
        .filter((id) => id !== null && id !== undefined);

      if (waypointPlaceIds.length > 0) {
        url += `&waypoint_place_ids=${waypointPlaceIds.join('%7C')}`;
      }
    }
  }

  // Add UTM parameters for tracking
  url += '&utm_source=ai_travel_planner&utm_campaign=optimized_walking_route';

  // Check URL length limit (Google Maps URLs are limited to 2,048 characters)
  if (url.length > 2048) {
    console.warn(
      'Google Maps URL exceeds 2048 character limit, creating simpler URL',
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
      '&utm_source=ai_travel_planner&utm_campaign=optimized_walking_route';
    return simpleUrl;
  }

  return url;
}
