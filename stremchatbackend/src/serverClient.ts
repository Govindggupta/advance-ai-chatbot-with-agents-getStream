import { StreamChat } from "stream-chat";

export const apikey = process.env.STREAM_API_KEY as string; 
export const apisecret = process.env.STREAM_API_SECRET as string;

if (!apikey || !apisecret) {
    throw new Error("Missing required env var for Stream_api_key and Stream_api_secret")
    
}

export const serverclient = new StreamChat(apikey, apisecret);
