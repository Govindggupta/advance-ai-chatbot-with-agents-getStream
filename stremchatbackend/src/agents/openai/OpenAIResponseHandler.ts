import { text } from "express";
import OpenAI from "openai";
import type { AssistantStream } from "openai/lib/AssistantStream";
import type { Channel, Event, MessageResponse, StreamChat } from "stream-chat";

export class OpenAIResponseHandler {
  private message_text = "";
  private chunk_counter = 0;
  private run_id = "";
  private is_done = false;
  private last_update_time = 0;

  constructor(
    private readonly openai: OpenAI,
    private readonly openAiThread: OpenAI.Beta.Threads.Thread,
    private readonly assistantStream: AssistantStream,
    private readonly chatClient: StreamChat,
    private readonly channel: Channel,
    private readonly message: MessageResponse,
    private readonly onDispose: () => void
  ) {
    this.chatClient.on("ai_indicator.stop", this.handleStopGenerating);
  }

  run = async () => {};

  dispose = async () => {
    if (this.is_done) {
      return;
    }
    this.is_done = true;
    this.chatClient.off("ai_indicator.stop", this.handleStopGenerating);
    this.onDispose();
  };

  //handle the stop of the generation
  private handleStopGenerating = async (event: Event) => {
    if (this.is_done || event.message_id !== this.message.id) {
      return;
    }

    console.log("stop generating for message ", this.message.id);
    if (!this.openai || !this.openAiThread || this.run_id) {
      return;
    }

    try {
      await this.openai.beta.threads.runs.cancel(this.run_id, {
        thread_id: this.openAiThread.id,
      });
    } catch (error) {
        console.log("error cancelling runn", error)
    }

    await this.channel.sendEvent({
        type: "ai_indicator.clear",
        cid: this.message.cid, 
        message_id: this.message.id
    }), 

    await this.dispose()
  };

  private handleStreamEvent = async (event: OpenAI.Beta.Assistants.AssistantStreamEvent) => {
    const {cid , id} = this.message
    
    if(event.event == "thread.run.created"){
      this.run_id = event.data.id
    } 
    else if (event.event === "thread.message.delta") {
      const textdelta = event.data.delta.content?.[0]
      if(textdelta?.type === "text" && textdelta.text){
        this.message.text += textdelta.text.value || ""
        const now = Date.now()
        if (now - this.last_update_time > 1000) {
          this.chatClient.partialUpdateMessage(id, {
            set: {text : this.message_text}
          })
          this.last_update_time = now 
        }
        this.chunk_counter += 1 
      }
    }
    else if (event.event === "thread.message.completed") {
      this.chatClient.partialUpdateMessage(id, {
        set: {
          text: 
            event.data.content[0].type === "text"
            ? event.data.content[0].text.value 
            : this.message_text
        }
      });
      this.channel.sendEvent({
        type: "ai_indicator.clear", 
        cid: cid, 
        message_id: id
      })
    }
    else if (event.event === "thread.run.step.created") {
      if (event.data.step_details.type === "message_creation") {
        this.channel.sendEvent({
          type: "ai_indicator.update", 
          ai_state:"AI_STATE_GENERATING", 
          cid: cid, 
          message_id: id
        })
      }
    }
  };

  
  // handle the errors 
  private handleError = async (error: Error) => {
    if (this.is_done) {
      return;
    }

    (await this.channel.sendEvent({
      type: "ai_indicator.update",
      ai_state: "AI_STATE_ERROR",
      cid: this.message.cid,
      message_id: this.message.id,
    }),
      await this.chatClient.partialUpdateMessage(this.message.id, {
        set: {
          text: error.message ?? "error generating the message",
          message: error.toString(),
        },
      }));

    await this.dispose();
  };

  // function for web search
  private performWebSearch = async (query: string) => {
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
    // if tavily not found
    if (!TAVILY_API_KEY) {
      return JSON.stringify({
        error: "Web seach is not available , apit key not configure",
      });
    }

    console.log(`performing a web search ${query}`);
    try {
      const response = await fetch("https//api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TAVILY_API_KEY}`,
        },
        body: JSON.stringify({
          query: query,
          search_depth: "advance",
          max_result: 5,
          include_answer: true,
          include_raw_content: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Tavily search failed for query "${query}:`, errorText);

        return JSON.stringify({
          error: `seach failed with status : ${response.status}`,
          details: errorText,
        });
      }

      const data = await response.json();
      console.log(`tavily search succesful for query : ${query}`);

      return JSON.stringify(data);
    } catch (error) {
      console.log(`An exception occured duing web search for ${query}`);
      return JSON.stringify({
        error: "An exception occured during the web search",
      });
    }
  };
}
