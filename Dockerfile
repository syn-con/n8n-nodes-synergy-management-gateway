# Build a self-hosted n8n image bundling the Active Directory community node.
#
# Pin the base image to the exact n8n version you run in production. Override at build time:
#   docker build --build-arg N8N_VERSION=<your-version> -t n8n-with-ad .
# Update the default below to match your deployment; do not ship :latest to production.
ARG N8N_VERSION=1.120.0
FROM docker.n8n.io/n8nio/n8n:${N8N_VERSION}

USER root
# Copy the compiled node (run `npm run build` first) into the custom-extensions directory.
COPY ./dist /opt/custom-nodes/n8n-nodes-activedirectory
USER node

ENV N8N_CUSTOM_EXTENSIONS=/opt/custom-nodes/n8n-nodes-activedirectory
