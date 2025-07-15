export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const objectKey = url.pathname.slice(1);
    const object = await env.R2_BUCKET.get(objectKey);

    if (!object) {
      return new Response("File not found", { status: 404 });
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'ETag': object.httpMetadata?.etag || '',
        'Content-Length': object.size
      }
    });
  }
}
