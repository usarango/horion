// Request-cookie adapter used only by Node route tests outside a Next server.
exports.cookies = async () => ({
  getAll: () => globalThis.__horionRouteCookieJar || [],
  set(name, value) {
    const jar = globalThis.__horionRouteCookieJar || [];
    globalThis.__horionRouteCookieJar = [
      ...jar.filter((cookie) => cookie.name !== name),
      { name, value },
    ];
  },
});
