# Lite Remote Builder MCP

**A lightweight Model Context Protocol (MCP) server for low-resource hardware.**

This tool allows an AI Assistant (Claude/Cline) to manage Docker builds without running the Docker Daemon locally. It offloads the heavy CPU/RAM usage to GitHub Actions.

## 🏗 Architecture

1.  **Local (Laptop):** The AI lints your Dockerfile and triggers builds via API.
2.  **Cloud (GitHub Actions):** Builds the image and pushes to DockerHub.
3.  **Deployment (QuickPod):** Pulls the image for hosting.

## 🚀 Setup

### 1. Prerequisites
*   Node.js v18+
*   A GitHub Repository with Actions enabled.
*   DockerHub Account.

### 2. Installation
```bash
npm install
npm run build
