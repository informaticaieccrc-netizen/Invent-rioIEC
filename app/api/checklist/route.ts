import { NextResponse } from 'next/server'
import { buildChecklistOpenApiSpec } from '@/lib/checklist/openapi'

export const runtime = 'nodejs'

function swaggerHtml(origin: string) {
  const specJson = JSON.stringify(buildChecklistOpenApiSpec(origin))
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Checklist - Inventário CRC</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; background: #f8fafc; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body::before { content: "API Checklist - Inventário CRC"; display: block; padding: 18px 32px; background: #0f172a; color: #f8fafc; font-size: 18px; font-weight: 800; }
      .topbar { display: none; }
      #swagger-ui { max-width: 1280px; margin: 0 auto; padding: 24px 28px 48px; }
      .swagger-ui .info, .swagger-ui .scheme-container, .swagger-ui .opblock-tag, .swagger-ui .opblock { border-radius: 10px; }
      .swagger-ui .opblock.opblock-post { background: #f0fdf4; border-color: #bbf7d0; }
      .swagger-ui .opblock.opblock-get { background: #eff6ff; border-color: #bfdbfe; }
      .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #16a34a; }
      .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #2563eb; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => SwaggerUIBundle({ spec: ${specJson}, dom_id: '#swagger-ui', deepLinking: true, persistAuthorization: true });
    </script>
  </body>
</html>`
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const spec = buildChecklistOpenApiSpec(url.origin)
  if (url.searchParams.get('format') === 'json') return NextResponse.json(spec)
  return new NextResponse(swaggerHtml(url.origin), { headers: { 'content-type': 'text/html; charset=utf-8' } })
}
