export default {
  async fetch() {
    return Response.json({ environment: "staging", status: "not_configured" }, {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
    });
  },
};
