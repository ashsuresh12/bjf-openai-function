import OpenAI from 'openai';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({
  version: 'v3',
  auth,
});

export async function generateImagesForPrompt(prompt) {
  const response = await openai.images.generate({
    prompt,
    n: 1,
    size: '1024x1024',
    response_format: 'b64_json',
  });

  const base64Data = response.data[0].b64_json;
  const imageBuffer = Buffer.from(base64Data, 'base64');
  const tmpFile = path.join('/tmp', `image-${Date.now()}.png`);
  await fs.writeFile(tmpFile, imageBuffer);

  const driveRes = await drive.files.create({
    requestBody: {
      name: path.basename(tmpFile),
      mimeType: 'image/png',
    },
    media: {
      mimeType: 'image/png',
      body: await fs.readFile(tmpFile),
    },
    fields: 'id',
  });

  const fileId = driveRes.data.id;

  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  const fileUrl = `https://drive.google.com/uc?id=${fileId}`;
  return fileUrl;
}