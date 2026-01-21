## Firestore Seeder

This folder contains admin tooling for seeding Firestore data. It is intentionally
separate from the web app so `npm run dev` only refers to the Vite app.

### Usage

1) `cd tools/seed`
2) `npm install`
3) Place your Firebase service account key as `serviceAccountKey.json` in this folder.
4) `npm run seed`
