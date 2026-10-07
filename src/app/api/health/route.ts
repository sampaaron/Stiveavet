/** Sonde de disponibilité : ne révèle ni version, ni configuration, ni état interne. */
export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
