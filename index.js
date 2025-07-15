const MIME_TYPES = {
  "txt": "text/plain",
  "html": "text/html",
  "css": "text/css",
  "js": "application/javascript",
  "json": "application/json",
  "png": "image/png",
  "jpg": "image/jpeg",
  "jpeg": "image/jpeg",
  "gif": "image/gif",
  "svg": "image/svg+xml",
  "ico": "image/x-icon",
  "webp": "image/webp",
  "mp4": "video/mp4",
  "pdf": "application/pdf",
  "woff": "font/woff",
  "woff2": "font/woff2",
  "ttf": "font/ttf",
  "eot": "application/vnd.ms-fontobject"
};

function getMimeType(path) {
  const extension = path.split('.').pop().toLowerCase();
  return MIME_TYPES[extension] || 'application/octet-stream';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const objectKey = url.pathname.slice(1);

    const object = await env.R2_BUCKET.get(objectKey);

    if (!object) {
      return new Response("File not found", { status: 404 });
    }

    const mimeType = object.httpMetadata?.contentType || getMimeType(objectKey);

    return new Response(object.body, {
      headers: {
        'Content-Type': mimeType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'public, max-age=31536000',
        'ETag': object.httpMetadata?.etag || '',
        'Content-Length': object.size
      }
    });
  }
}

