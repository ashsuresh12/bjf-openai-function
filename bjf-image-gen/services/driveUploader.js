import { google } from "googleapis";
import axios from "axios";

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive"]
});

export async function uploadImageToDrive(imageUrl, prompt, hex) {
  const drive = google.drive({ version: "v3", auth });

  const imageBuffer = await axios.get(imageUrl, { responseType: "arraybuffer" }).then(res => res.data);

  const fileName = `${prompt.slice(0, 30).replace(/\s+/g, "_")}_${hex.replace("#", "")}.png`;

  const fileMetadata = {
    name: fileName,
    parents: [/* Optional: Add folder ID if needed */]
  };

  const media = {
    mimeType: "image/png",
    body: Buffer.from(imageBuffer)
  };

  const uploadedFile = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: "id"
  });

  await drive.permissions.create({
    fileId: uploadedFile.data.id,
    requestBody: { role: "reader", type: "anyone" }
  });

  const file = await drive.files.get({
    fileId: uploadedFile.data.id,
    fields: "webViewLink"
  });

  return file.data;
}