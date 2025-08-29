import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/places-photo
 * Proxies Google Places Photo media by name, accepts search params:
 * - name (required), maxWidthPx, maxHeightPx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const photoName = searchParams.get('name');
    const maxWidthPx = searchParams.get('maxWidthPx') || '400';
    const maxHeightPx = searchParams.get('maxHeightPx') || '400';

    if (!photoName) {
      return NextResponse.json(
        { error: 'Photo name is required' },
        { status: 400 },
      );
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return NextResponse.json(
        { error: 'Google Maps API key not configured' },
        { status: 500 },
      );
    }

    // Fetch photo from Google Place Photos API
    const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&maxHeightPx=${maxHeightPx}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

    const response = await fetch(photoUrl);

    if (!response.ok) {
      console.error(
        'Failed to fetch photo:',
        response.status,
        response.statusText,
      );
      return NextResponse.json(
        { error: 'Failed to fetch photo' },
        { status: response.status },
      );
    }

    // Get the image data and return it
    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      },
    });
  } catch (error) {
    console.error('Error fetching place photo:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
