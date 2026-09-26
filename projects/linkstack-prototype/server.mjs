import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const publicDirectory = join(process.cwd(), "public");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer((request, response) => {
  const requestPath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const pathname = requestPath === "/" || !extname(requestPath) ? "/index.html" : requestPath;
  const relativePath = normalize(pathname ?? "/index.html").replace(/^[/\\]+/, "");
  const filePath = join(publicDirectory, relativePath);

  if (!filePath.startsWith(publicDirectory)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  response.setHeader(
    "content-type",
    contentTypes[extname(filePath)] ?? "application/octet-stream",
  );
  createReadStream(filePath)
    .on("error", () => {
      response.statusCode = 404;
      response.end("Not found");
    })
    .pipe(response);
}).listen(4186, "127.0.0.1", () => {
  process.stdout.write("LinkStack mockup: http://127.0.0.1:4186\n");
});
