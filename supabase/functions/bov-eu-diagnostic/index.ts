// Temporary, public diagnostic endpoint for testing Supabase Edge Function deployment.
// No secrets, database access, user data, or privileged operations.
// Deploy with Verify JWT OFF. Remove after confirming the deployment pipeline.
Deno.serve((request: Request): Response => {
  if (request.method !== "POST") {
    return Response.json(
      { ok: false, error: "Method not allowed" },
      { status: 405, headers: { "Allow": "POST", "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    {
      ok: true,
      function: "bov-eu-diagnostic",
      stage: "runtime_only",
      message: "Edge Function runtime is working. No database or secret was tested.",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
});
