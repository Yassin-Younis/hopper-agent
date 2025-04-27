import {promises as fs} from "fs";

export async function getBase64Image(path) {
    const imageData = await fs.readFile(path);
    return `data:image/png;base64,${imageData.toString('base64')}`;
}