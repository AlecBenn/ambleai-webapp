import { generatePlaces } from '../../../lib/gemini';

/**
 * POST /api/generate-route
 * Accepts { userInput: string } and returns a structured walking route:
 * { success, data, googleRoutesPayload, optimization, message }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { userInput } = body;

    // Validate input
    if (!userInput || userInput.trim().length === 0) {
      return Response.json(
        {
          error: 'User input is required',
        },
        { status: 400 },
      );
    }

    if (userInput.length > 500) {
      return Response.json(
        {
          error: 'Input too long. Please keep it under 500 characters.',
        },
        { status: 400 },
      );
    }

    console.log('Processing user input:', userInput);

    // Call Gemini AI
    const result = await generatePlaces(userInput);

    if (result.success) {
      console.log('Gemini AI Response:', JSON.stringify(result.data, null, 2));
      console.log(
        'Google Routes API Payload:',
        JSON.stringify(result.googleRoutesPayload, null, 2),
      );

      if (result.optimization) {
        console.log(
          'Route Optimization Result:',
          JSON.stringify(result.optimization, null, 2),
        );
      }

      // Return the structured response
      return Response.json({
        success: true,
        data: result.data,
        googleRoutesPayload: result.googleRoutesPayload,
        optimization: result.optimization,
        message: 'Places generated and route optimized successfully',
      });
    } else {
      console.error('Gemini AI Error:', result.error);

      return Response.json(
        {
          success: false,
          error: result.error,
          message: 'Failed to generate places',
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('API Route Error:', error);

    return Response.json(
      {
        success: false,
        error: 'Internal server error',
        message: 'Something went wrong processing your request',
      },
      { status: 500 },
    );
  }
}
