'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';

interface Location {
  lat: number;
  lng: number;
}

interface AuthorAttribution {
  displayName?: string;
  uri?: string;
  photoUri?: string;
}

interface VerificationData {
  verified: boolean;
  confidence: number;
  error?: string;
  verifiedData?: {
    id: string;
    name: string;
    address: string;
    location: Location;
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
    types: string[];
    place_id: string;
  };
  alternatives?: unknown[];
}

interface Place {
  name: string;
  type: string;
  description: string;
  reasoning: string;
  address: string;
  location: Location | null;
  place_id: string | null;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  types?: string[];
  verification?: VerificationData;
  photos?: {
    name: string;
    widthPx: number;
    heightPx: number;
    authorAttributions?: AuthorAttribution[];
  }[];
}

interface RoutePreferences {
  travel_mode: string;
  optimize: boolean;
  avoid_highways: boolean;
  avoid_tolls: boolean;
}

interface VerificationSummary {
  totalPlaces: number;
  verifiedPlaces: number;
  verificationRate: number;
  unverifiedPlaces: number;
}

interface RouteOptimization {
  originalOrder: number[];
  optimizedOrder: number[];
  totalDuration: number | null;
  totalDistance: number | null;
  estimatedWalkingTime: string | null;
}

interface RouteResponse {
  city: string;
  places: Place[];
  route_preferences: RoutePreferences;
  total_estimated_walking_time: string;
  notes?: string;
  google_maps_url?: string;
  verification?: VerificationSummary;
  optimization?: RouteOptimization;
}

/**
 * Main page component: collects user preferences, calls the API, and renders the route UI
 */
export default function Home() {
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<RouteResponse | null>(null);
  const [error, setError] = useState('');

  /**
   * Submit handler: validates input and requests a generated route from the backend
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userInput.trim()) {
      setError('Please enter your travel preferences');
      return;
    }

    if (userInput.length > 500) {
      setError('Input too long. Please keep it under 500 characters.');
      return;
    }

    setIsLoading(true);
    setError('');
    setResponse(null);

    try {
      const res = await fetch('/api/generate-route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userInput }),
      });

      const data = await res.json();

      if (data.success) {
        console.log('Gemini AI Response:', data.data);
        setResponse(data.data);
      } else {
        setError(data.error || 'Failed to generate route');
      }
    } catch (err) {
      console.error('Request failed:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Allow Enter to submit textarea (Shift+Enter for new line)
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  /**
   * Generate a Google Maps URL for a single place, preferring place_id
   */
  const generateIndividualPlaceUrl = (place: Place) => {
    // Generate Google Maps URL for individual place
    if (place.place_id) {
      return `https://www.google.com/maps/place/?q=place_id:${place.place_id}`;
    } else if (place.location) {
      return `https://www.google.com/maps/search/?api=1&query=${place.location.lat},${place.location.lng}`;
    } else if (place.address) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        place.address,
      )}`;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {!response ? (
          <>
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">
                Amble AI
              </h1>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Tell us your travel preferences and we&apos;ll create a
                personalized walking route with amazing places to visit!
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label
                    htmlFor="preferences"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    What are you looking for? (e.g., &quot;historical sites,
                    great food, theatre&quot;)
                  </label>
                  <textarea
                    id="preferences"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="Enter your ideal number of stops, origin, destination, interests, and the city you want to explore..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={4}
                    maxLength={500}
                    disabled={isLoading}
                    onKeyDown={handleKeyDown}
                  />
                  <div className="text-right text-sm text-gray-500 mt-1">
                    {userInput.length}/500 characters
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-700">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || !userInput.trim()}
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Planning Your Route...
                    </div>
                  ) : (
                    'Plan My Route'
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            {/* Compact header with refresh icon */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Amble AI</h1>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 bg-white border border-blue-100 rounded-lg px-3 py-2 shadow-sm"
                aria-label="New chat"
                title="New chat"
              >
                <MessageSquare className="w-4 h-4" />
                New chat
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              {/* Title */}
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Your Journey Through {response.city}
                </h2>
              </div>

              {/* Simplified Google Maps Route */}
              {response.google_maps_url && (
                <div className="mb-6 text-center">
                  <a
                    href={response.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    Open Google Maps Route
                  </a>
                  <div className="mt-2 text-sm text-gray-600 flex items-center justify-center gap-4">
                    {response.optimization?.estimatedWalkingTime && (
                      <span>{response.optimization.estimatedWalkingTime}</span>
                    )}
                    {response.optimization?.totalDistance && (
                      <span>
                        {(response.optimization.totalDistance / 1000).toFixed(
                          2,
                        )}{' '}
                        km
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Compact stops grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {response.places.map((place, index) => {
                  const placeUrl = generateIndividualPlaceUrl(place);
                  return (
                    <div
                      key={index}
                      className="border rounded-lg p-3 hover:shadow-sm transition cursor-pointer bg-gray-50"
                      onClick={() => {
                        if (placeUrl) {
                          window.open(
                            placeUrl,
                            '_blank',
                            'noopener,noreferrer',
                          );
                        }
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {place.name}
                          </div>
                          <div className="text-xs text-gray-600 truncate">
                            {place.address}
                          </div>
                          {place.reasoning && (
                            <div className="mt-1 text-xs text-gray-500 line-clamp-2">
                              {place.reasoning}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Optional notes */}
            {response.notes && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="font-medium text-amber-900 mb-1 text-sm">
                  Travel Tips
                </h4>
                <p className="text-amber-800 text-sm">{response.notes}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
