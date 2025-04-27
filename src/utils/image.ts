import { promises as fs } from "fs";
import { LOG_PREFIX } from "../common/constants";

/**
 * Reads an image file and returns its base64 data URI representation.
 * @param path Path to the image file.
 * @returns A Promise resolving to the base64 data URI string.
 * @throws If the file cannot be read.
 */
export async function getBase64Image(path: string): Promise<string> {
    try {
        const imageData = await fs.readFile(path);
        return `data:image/png;base64,${imageData.toString('base64')}`;
    } catch (error: any) {
        console.error(`${LOG_PREFIX} Error reading image file at ${path}:`, error);
        throw new Error(`Failed to read image file: ${error.message}`);
    }
}