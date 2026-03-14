# Website Deploy Guide

Date: 2026-03-14  
App: `web/`

## Goal

Deploy the `Aionis OpenClaw Adapter` landing site as a static site without requiring a separate runtime.

## What Is Already Wired

This repo now includes:

1. a static Next.js site in `web/`
2. `output: export` in `web/next.config.mjs`
3. a GitHub Pages workflow at `.github/workflows/deploy-site.yml`
4. a `.nojekyll` file in `web/public/`
5. an optional `CNAME` template in `web/public/CNAME.example`

## Default Deploy Path

Without a custom domain, the intended first deployment target is **GitHub Pages**.

The workflow triggers on:

1. pushes to `main`
2. pushes to `aionis/bootstrap-v1`
3. manual runs through `workflow_dispatch`

## One-Time Repo Setup

In GitHub repository settings:

1. open `Settings -> Pages`
2. set `Source` to `GitHub Actions`
3. save

After that, pushes that touch `web/**` can publish the site automatically.

## Local Verification

Before relying on the workflow, verify locally:

```bash
cd web
npm ci
npm run build
```

Expected output:

- static export created in `web/out`
- no runtime server required for deployment

## Custom Domain

If you later want a custom domain:

1. copy `web/public/CNAME.example` to `web/public/CNAME`
2. replace the placeholder with the real domain
3. commit the file
4. update DNS to point at GitHub Pages

Do not commit `CNAME` until the real domain is decided.

## Current Boundary

This deploy setup provides:

1. a working static export path
2. a repository-native GitHub Pages workflow
3. an easy upgrade path to a custom domain later

It does not yet provide:

1. an assigned production domain
2. analytics
3. custom SEO assets beyond the page metadata already in the app
