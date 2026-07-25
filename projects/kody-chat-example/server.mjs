import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const publicDirectory = join(process.cwd(), "public");
const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
};

createServer((request, response) => {
  const pathname = request.url === "/" ? "/index.html" : request.url;
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
}).listen(4178, "127.0.0.1", () => {
  process.stdout.write("Kody Chat example: http://127.0.0.1:4178\n");
});
