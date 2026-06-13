#!/bin/bash
# ============================================================
#  DeSocial — Cloudflare Tunnel 启动脚本
# ============================================================
#  使用方法: ./启动隧道.sh
#  将本地后端 :3002 暴露到 https://api.desocial.top
# ============================================================

CONFIG="$(cd "$(dirname "$0")" && pwd)/cloudflare-tunnel.yml"

echo "========================================"
echo "  DeSocial — Cloudflare Tunnel"
echo "========================================"
echo "后端: http://localhost:3002"
echo "公网: https://api.desocial.top"
echo ""

cloudflared tunnel --edge-ip-version 4 --config "$CONFIG" run desocial-api
