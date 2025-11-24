// r2-cdn-proxy – Cloudflare Worker cho CDN R2 + Unity WebGL (production)

// MIME types cho static assets + Unity
const MIME_TYPES = {
  txt: "text/plain; charset=utf-8",
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",

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
  bin: "application/octet-stream"
};

function getMimeType(pathname) {
  const ext = pathname.split(".").pop().toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*"
  };
}

// Chuẩn hoá key trong R2 – luôn bỏ dấu "/" đầu, có thể map root -> index.html
function getObjectKey(url) {
  let key = url.pathname.replace(/^\/+/, "");
  if (!key) key = "index.html"; // nếu không cần index.html thì bỏ dòng này
  return key;
}

export default {
  async fetch(request, env, ctx) {
    const { method } = request;

    // 1) CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(),
          Vary: "Origin"
        }
      });
    }

    // Chỉ cho GET / HEAD
    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: corsHeaders()
      });
    }

    const url = new URL(request.url);

    // 2) Cache key ở EDGE – luôn dùng GET; nếu query chỉ để bust cache
    // có thể strip query: new URL(url.origin + url.pathname)
    const cacheUrl = url;
    const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
    const cache = caches.default;

    // 3) Lấy từ EDGE cache trước
    let cached = await cache.match(cacheKey);
    if (cached) {
      if (method === "HEAD") {
        return new Response(null, {
          status: cached.status,
          headers: cached.headers
        });
      }
      return cached;
    }

    // 4) Đọc object từ R2 (hỗ trợ Range cho video/file lớn)
    const objectKey = getObjectKey(url);

    const rangeHeader = request.headers.get("Range");
    let range = null;

    if (rangeHeader && /^bytes=([0-9]*)-([0-9]*)$/.test(rangeHeader)) {
      const [, startStr, endStr] = rangeHeader.match(
        /^bytes=([0-9]*)-([0-9]*)$/
      );
      const start = startStr ? parseInt(startStr, 10) : undefined;
      const end = endStr ? parseInt(endStr, 10) : undefined;
      range = { start, end };
    }

    const r2Options = {};
    if (range && range.start >= 0) {
      if (range.end !== undefined && range.end >= range.start) {
        r2Options.range = {
          offset: range.start,
          length: range.end - range.start + 1
        };
      } else {
        r2Options.range = { offset: range.start };
      }
    }

    const object = await env.R2_BUCKET.get(objectKey, r2Options);

    if (!object) {
      return new Response("File not found", {
        status: 404,
        headers: corsHeaders()
      });
    }

    const mimeType =
      object.httpMetadata?.contentType || getMimeType(objectKey);
    const etag = object.httpEtag || object.etag;
    const size = object.size;

    const headers = {
      ...corsHeaders(),
      "Content-Type": mimeType,
      // Cache 1 năm ở browser + EDGE
      "Cache-Control": "public, max-age=31536000, immutable",
      // Tránh cache mismatch giữa gzip / brotli + CORS
      Vary: "Accept-Encoding, Origin",
      "Accept-Ranges": "bytes"
    };

    if (etag) headers.ETag = etag;

    // 5) 304 Not Modified (chỉ cho request full, không range)
    const ifNoneMatch = request.headers.get("If-None-Match");
    if (ifNoneMatch && etag && ifNoneMatch === etag && !range) {
      return new Response(null, {
        status: 304,
        headers
      });
    }

    let status = 200;
    if (range && range.start >= 0 && size != null) {
      const start = range.start;
      const end = range.end && range.end < size ? range.end : size - 1;
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
      status = 206; // Partial Content
    }

    const response = new Response(object.body, {
      status,
      headers
    });

    // 6) Lưu vào EDGE cache – chỉ cache bản 200 full, tránh cache 206
    if (status === 200) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    // HEAD: trả chỉ header, không body
    if (method === "HEAD") {
      return new Response(null, {
        status,
        headers
      });
    }

    return response;
  }
};
