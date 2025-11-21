// Map MIME type cho các loại file thường gặp + Unity WebGL
const MIME_TYPES = {
  txt: "text/plain",
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  webp: "image/webp",
  mp4: "video/mp4",
  pdf: "application/pdf",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  eot: "application/vnd.ms-fontobject",

  // Unity / WebGL
  wasm: "application/wasm",
  bundle: "application/octet-stream",
  data: "application/octet-stream",
};

function getMimeType(path) {
  const extension = path.split(".").pop().toLowerCase();
  return MIME_TYPES[extension] || "application/octet-stream";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}

export default {
  async fetch(request, env, ctx) {
    const { method } = request;

    // Preflight CORS
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(),
        },
      });
    }

    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);

    // Chuẩn hoá key: luôn dùng method GET cho cache
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cache = caches.default;

    // 1) Thử lấy từ EDGE cache trước
    let cached = await cache.match(cacheKey);
    if (cached) {
      // Với HEAD, trả về chỉ header (body không cần nhưng có cũng không sao)
      if (method === "HEAD") {
        return new Response(null, {
          status: cached.status,
          headers: cached.headers,
        });
      }
      return cached;
    }

    // 2) Không có trong cache -> đọc từ R2
    let objectKey = url.pathname.replace(/^\/+/, ""); // "/Build/x" -> "Build/x"
    if (!objectKey) {
      objectKey = "index.html"; // nếu không dùng index.html thì bỏ dòng này
    }

    const object = await env.R2_BUCKET.get(objectKey);

    if (!object) {
      return new Response("File not found", {
        status: 404,
        headers: corsHeaders(),
      });
    }

    const mimeType =
      object.httpMetadata?.contentType || getMimeType(objectKey);
    const etag = object.etag;

    const headers = {
      ...corsHeaders(),
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    };

    if (etag) {
      headers["ETag"] = etag;
    }
    if (object.size != null) {
      headers["Content-Length"] = object.size;
    }

    // Hỗ trợ If-None-Match (304 Not Modified)
    const ifNoneMatch = request.headers.get("If-None-Match");
    if (ifNoneMatch && etag && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers,
      });
    }

    // 3) Tạo response từ R2
    const response = new Response(object.body, {
      status: 200,
      headers,
    });

    // 4) Lưu vào EDGE cache (async, không chặn response)
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    // 5) Với HEAD chỉ trả header, không cần body
    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers,
      });
    }

    return response;
  },
};
