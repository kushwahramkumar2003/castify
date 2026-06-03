export interface RtmpCallbackBody {
  call: "publish" | "play" | "update" | "record_done";
  addr: string;
  clientid: string;
  app: string;
  flashver?: string;
  swfurl?: string;
  tcurl?: string;
  pageurl?: string;
  name: string;
}
