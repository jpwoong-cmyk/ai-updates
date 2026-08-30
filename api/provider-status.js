import {
  getAllProviderStatuses
} from "../lib/provider-status.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");

    return response.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const result =
      await getAllProviderStatuses();

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=180, stale-while-revalidate=600"
    );

    return response.status(200).json({
      service: "ai-provider-status",
      mode: "api-only",
      ...result
    });
  } catch (error) {
    console.error(
      "AI provider status endpoint failed:",
      error
    );

    response.setHeader(
      "Cache-Control",
      "no-store"
    );

    return response.status(500).json({
      service: "ai-provider-status",
      mode: "api-only",
      error:
        error instanceof Error
          ? error.message
          : "Provider status could not be loaded.",
      providers: []
    });
  }
}
