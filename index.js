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

  // 🔹 Unity / WebGL
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

    // ✅ Preflight CORS
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

    // "/Build/file" -> "Build/file", "/" -> "index.html" (tuỳ bạn có index.html hay không)
    let objectKey = url.pathname.replace(/^\/+/, "");
    if (!objectKey) {
      objectKey = "index.html"; // hoặc comment dòng này nếu không dùng
    }

    // Lấy object từ R2
    const object = await env.R2_BUCKET.get(objectKey);

    if (!object) {
      return new Response("File not found", {
        status: 404,
        headers: corsHeaders(),
      });
    }

    const mimeType = object.httpMetadata?.contentType || getMimeType(objectKey);
    const etag = object.etag;

    const baseHeaders = {
      ...corsHeaders(),
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "ETag": etag,
    };

    if (object.size != null) {
      baseHeaders["Content-Length"] = object.size;
    }

    // ✅ Hỗ trợ If-None-Match để client cache tốt hơn
    const ifNoneMatch = request.headers.get("If-None-Match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: baseHeaders,
      });
    }

    // HEAD: chỉ trả header, không trả body
    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: baseHeaders,
      });
    }

    // GET: trả nội dung file
    return new Response(object.body, {
      status: 200,
      headers: baseHeaders,
    });
  },
};
