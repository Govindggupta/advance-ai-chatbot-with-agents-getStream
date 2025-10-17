import type { Channel, StreamChat, User } from "stream-chat";


export interface AIAgent {
    user?: User 
    channel: Channel
    chatClient: StreamChat
    getLastInteraction: () => number 
    dispose: () => Promise<void>;
} 

export enum AgentPlatform {
    OPENAI = "openai", 
    WRITING_ASSISTANT = "writing_assistant"
}

export interface WritingMessage {
    custom? :{
        suggestion?: string[]
        writingTask? :string;
        messageType? : "user_input" | "ai_response" |"system_message";
    }
}