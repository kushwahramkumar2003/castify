export interface MockUser {
  userId: string;
  streamId: string;
  username: string;
}

export const MOCK_STREAM_KEYS = new Map<string, MockUser>([
  [
    "local-dev-key-streamer-01",
    {
      userId: "user-0001-0000-0000-000000000001",
      streamId: "stream-0001-0000-0000-000000000001",
      username: "streamer_alice",
    },
  ],
  [
    "local-dev-key-streamer-02",
    {
      userId: "user-0002-0000-0000-000000000002",
      streamId: "stream-0002-0000-0000-000000000002",
      username: "streamer_bob",
    },
  ],
  [
    "local-dev-key-streamer-03",
    {
      userId: "user-0003-0000-0000-000000000003",
      streamId: "stream-0003-0000-0000-000000000003",
      username: "streamer_carol",
    },
  ],
]);
