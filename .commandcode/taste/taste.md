# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# architecture
- Follow the 3-service video pipeline: transcoding-service (FFmpeg only), hls-packager (packaging + object storage upload), separate concerns. Confidence: 0.85
- transcoding-service should be generic/static — support all quality levels without requiring code changes for new qualities. Confidence: 0.75
- hls-packager is solely responsible for segment packaging and uploading to object storage (MinIO/S3), generically. Confidence: 0.75

# documentation
- Write AWS setup instructions using the web console (not AWS CLI). Confidence: 0.65
- Include detailed cost calculations and pricing breakdowns in infrastructure documentation. Confidence: 0.70

# ffmpeg
- Use system-installed ffmpeg binary (not ffmpeg-static). Confidence: 0.85
- Use RTMP direct input from nginx-rtmp (not HLS relay). Confidence: 0.85
- For debugging FFmpeg issues, invoke the system binary directly via shell rather than scripting through fluent-ffmpeg. Confidence: 0.65

# workflow
- Research before writing code when designing schemas or architecture. Confidence: 0.60

# prisma
- Export Prisma client as a singleton from the schema file. Confidence: 0.65
- Manually load .env in prisma.config.ts using node:fs — Prisma CLI runs in Node.js context (even via bunx) and doesn't auto-load .env like Bun does. Confidence: 0.70

# auth
- Use password-based authentication (not OAuth or JWT-only). Confidence: 0.50
- Use single Bearer token with httpOnly cookie (`castify_token`) + JSON body return. Middleware parses from both cookie and Authorization header. No refresh tokens. Confidence: 0.70

# user-profile
- Email is permanent/immutable for each user — do not allow email updates in profile edit endpoints. Confidence: 0.85

# frontend
- Use Next.js 16, React, shadcn/ui, and Tailwind CSS for the frontend. Confidence: 0.70
- Use the shadcn CLI (`npx shadcn-ui add`) for component installation instead of manually writing component files. Confidence: 0.65
- Build reusable components as the default pattern. Confidence: 0.65
- Establish color tokens and theme system before building UI components. Confidence: 0.65

# ui-style
- Use dark theme with transparent shading, minimal colors, no gradients — polished, clean, and solid aesthetic. Confidence: 0.65

# api-integration
- Integrate APIs with full validation (client-side and server-side). Confidence: 0.55
