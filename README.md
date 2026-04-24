# CPU Stock Dashboard

A zero-backend, zero-cost dashboard for tracking CPU-related stocks across chip design, foundry, memory, and semiconductor equipment.

## Features

- Live quotes and daily history from Stooq when available
- Offline fallback tape so the interface still works without a market feed
- Swiss-style ranked equity tape with sparklines
- Non-overlapping silicon floorplan with momentum rails, risk bands, and signal labels
- Equal-weight silicon pulse plus segment cards for design, foundry, memory, and equipment
- Browser-local thesis notes and optional alert levels

## Free Deployment

This project is static: `index.html`, `styles.css`, and `app.js`. It can be hosted for free on GitHub Pages.

The included GitHub Actions workflow publishes the site automatically from `main`.
