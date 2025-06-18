import { google } from "googleapis";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const SCOPES = ["https://www.googleapis.com/auth/drive"];
const FOLDER_ID = process.env.GDRIVE_FOLDER_ID;

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
  scopes: SCOPES,
});

const drive = google.drive({ version: "v3", auth });

export async function uploadToDrive(localFilePath, fileName) {
  const fileMetadata = {
    name: fileName,
    parents: [FOLDER_ID],
  };

  const media = {
    mimeType: "image/png",
    body: fs.createReadStream(localFilePath),
  };

  const response = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: "id",
  });

  const fileId = response.data.id;

  await drive.permissions.create({
    fileId: fileId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  const publicUrl = `https://drive.google.com/uc?id=${fileId}`;
  return publicUrl;
}