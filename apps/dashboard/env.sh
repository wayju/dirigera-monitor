#!/bin/sh
# Generate runtime environment configuration
# This runs at container startup, before the Next.js server

ENV_FILE="/app/public/__env.js"

# Default to empty string if not set (client will use fallback)
API_URL="${API_URL:-}"

cat > "$ENV_FILE" << EOF
window.__ENV = {
  API_URL: "${API_URL}"
};
EOF

echo "Generated runtime config: API_URL=${API_URL:-'(not set, will use default)'}"

# Execute the main command (node server.js)
exec "$@"
