import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildContentVariables,
  buildStatusCallbackUrl,
  fetchTwilioMedia,
  sendMediaMessage,
  sendTemplateMessage,
  sendTextMessage,
  translateTwilioStatus,
  twilioCredentialsFromConfig,
  type TwilioSendCredentials,
} from "./twilio-api";
import type { MessageTemplate } from "@/types";

// Validation assertions run BEFORE the network call — stub fetch to a
// never-resolving mock so an accidental fall-through hangs (and fails)
// rather than silently hitting api.twilio.com.
const neverFetch = () =>
  new Promise<Response>(() => {
    /* intentionally never resolves */
  });

const CREDENTIALS: TwilioSendCredentials = {
  accountSid: "AC00000000000000000000000000000001",
  apiKeySid: null,
  authSecret: "secret-token",
  fromNumber: "14155550100",
  messagingServiceSid: null,
};

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  form: URLSearchParams;
}

function captureFetch(responseBody: unknown, status = 201) {
  const captured: CapturedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      captured.push({
        url: String(url),
        method: init.method ?? "GET",
        headers: (init.headers ?? {}) as Record<string, string>,
        form: new URLSearchParams(String(init.body ?? "")),
      });
      return new Response(JSON.stringify(responseBody), { status });
    }),
  );
  return captured;
}

beforeEach(() => {
  // Deterministic StatusCallback behaviour regardless of the host env.
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  vi.stubEnv("TWILIO_WEBHOOK_SECRET", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendTextMessage", () => {
  it("posts a form-encoded Body to the account's Messages endpoint with Basic auth", async () => {
    const captured = captureFetch({ sid: "SM123" });

    const result = await sendTextMessage({
      credentials: CREDENTIALS,
      to: "584248274759",
      text: "Hello there",
    });

    expect(result).toEqual({ messageId: "SM123" });
    expect(captured).toHaveLength(1);
    const req = captured[0];
    expect(req.url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${CREDENTIALS.accountSid}/Messages.json`,
    );
    expect(req.method).toBe("POST");
    expect(req.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    const expectedAuth =
      "Basic " +
      Buffer.from(`${CREDENTIALS.accountSid}:secret-token`).toString("base64");
    expect(req.headers.Authorization).toBe(expectedAuth);
    expect(req.form.get("To")).toBe("whatsapp:+584248274759");
    expect(req.form.get("From")).toBe("whatsapp:+14155550100");
    expect(req.form.get("Body")).toBe("Hello there");
    expect(req.form.get("MessagingServiceSid")).toBeNull();
    expect(req.form.get("StatusCallback")).toBeNull();
  });

  it("uses the API key SID as the Basic-auth username when configured", async () => {
    const captured = captureFetch({ sid: "SM124" });

    await sendTextMessage({
      credentials: {
        ...CREDENTIALS,
        apiKeySid: "SK00000000000000000000000000000001",
      },
      to: "584248274759",
      text: "hi",
    });

    const expectedAuth =
      "Basic " +
      Buffer.from(
        "SK00000000000000000000000000000001:secret-token",
      ).toString("base64");
    expect(captured[0].headers.Authorization).toBe(expectedAuth);
  });

  it("pins From alongside MessagingServiceSid when configured", async () => {
    const captured = captureFetch({ sid: "SM125" });

    await sendTextMessage({
      credentials: {
        ...CREDENTIALS,
        messagingServiceSid: "MG00000000000000000000000000000001",
      },
      to: "584248274759",
      text: "hi",
    });

    expect(captured[0].form.get("MessagingServiceSid")).toBe(
      "MG00000000000000000000000000000001",
    );
    // From stays pinned so a pool-selected sender can never diverge from
    // the phone_number_id the inbound webhook routes on.
    expect(captured[0].form.get("From")).toBe(
      `whatsapp:+${CREDENTIALS.fromNumber}`,
    );
  });

  it("rejects Body values over Twilio's 1,600-character limit before posting", async () => {
    const captured = captureFetch({ sid: "SM127" });

    await expect(
      sendTextMessage({
        credentials: CREDENTIALS,
        to: "584248274759",
        text: "x".repeat(1601),
      }),
    ).rejects.toThrow(/1,600-character limit \(1601 chars\)/);
    expect(captured.length).toBe(0);
  });

  it("appends StatusCallback when BOTH env vars are set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://wacrm.medine.tech/");
    vi.stubEnv("TWILIO_WEBHOOK_SECRET", "hook-secret");
    const captured = captureFetch({ sid: "SM126" });

    await sendTextMessage({
      credentials: CREDENTIALS,
      to: "584248274759",
      text: "hi",
    });

    expect(captured[0].form.get("StatusCallback")).toBe(
      "https://wacrm.medine.tech/api/whatsapp/webhook/twilio?token=hook-secret",
    );
  });

  it("omits StatusCallback when only one env var is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://wacrm.medine.tech");
    const captured = captureFetch({ sid: "SM127" });

    await sendTextMessage({
      credentials: CREDENTIALS,
      to: "584248274759",
      text: "hi",
    });

    expect(captured[0].form.get("StatusCallback")).toBeNull();
    expect(buildStatusCallbackUrl()).toBeUndefined();
  });

  it("throws when Twilio returns no sid", async () => {
    captureFetch({});
    await expect(
      sendTextMessage({ credentials: CREDENTIALS, to: "1", text: "x" }),
    ).rejects.toThrow(/returned no sid/);
  });
});

describe("sendMediaMessage", () => {
  it("sends MediaUrl with the caption as Body", async () => {
    const captured = captureFetch({ sid: "MM1" });

    await sendMediaMessage({
      credentials: CREDENTIALS,
      to: "584248274759",
      link: "https://cdn.example.com/pic.jpg",
      caption: "Look at this",
    });

    expect(captured[0].form.get("MediaUrl")).toBe(
      "https://cdn.example.com/pic.jpg",
    );
    expect(captured[0].form.get("Body")).toBe("Look at this");
  });

  it("omits Body when there is no caption", async () => {
    const captured = captureFetch({ sid: "MM2" });

    await sendMediaMessage({
      credentials: CREDENTIALS,
      to: "584248274759",
      link: "https://cdn.example.com/doc.pdf",
    });

    expect(captured[0].form.get("Body")).toBeNull();
  });

  it("rejects a missing link before the network call", async () => {
    vi.stubGlobal("fetch", vi.fn(neverFetch));
    await expect(
      sendMediaMessage({ credentials: CREDENTIALS, to: "1", link: "" }),
    ).rejects.toThrow(/requires a link/);
  });
});

describe("sendTemplateMessage", () => {
  const template = {
    twilio_content_sid: "HX00000000000000000000000000000001",
  } as MessageTemplate;

  it("rejects a template without a Content SID before the network call", async () => {
    vi.stubGlobal("fetch", vi.fn(neverFetch));
    await expect(
      sendTemplateMessage({
        credentials: CREDENTIALS,
        to: "584248274759",
        templateName: "promo",
        template: {} as MessageTemplate,
      }),
    ).rejects.toThrow(/not synced from Twilio \(missing Content SID\)/);
    await expect(
      sendTemplateMessage({
        credentials: CREDENTIALS,
        to: "584248274759",
        templateName: "promo",
      }),
    ).rejects.toThrow(/run template Sync/);
  });

  it("sends ContentSid + ContentVariables built from positional params", async () => {
    const captured = captureFetch({ sid: "SM200" });

    await sendTemplateMessage({
      credentials: CREDENTIALS,
      to: "584248274759",
      templateName: "promo",
      template,
      params: ["Ada", "Tuesday"],
    });

    expect(captured[0].form.get("ContentSid")).toBe(
      "HX00000000000000000000000000000001",
    );
    expect(captured[0].form.get("ContentVariables")).toBe(
      JSON.stringify({ "1": "Ada", "2": "Tuesday" }),
    );
    expect(captured[0].form.get("Body")).toBeNull();
  });

  it("omits ContentVariables when there are no params", async () => {
    const captured = captureFetch({ sid: "SM201" });

    await sendTemplateMessage({
      credentials: CREDENTIALS,
      to: "584248274759",
      templateName: "promo",
      template,
    });

    expect(captured[0].form.get("ContentVariables")).toBeNull();
  });

  it("prefers structured messageParams.body over legacy params", async () => {
    const captured = captureFetch({ sid: "SM202" });

    await sendTemplateMessage({
      credentials: CREDENTIALS,
      to: "584248274759",
      templateName: "promo",
      template,
      params: ["legacy"],
      messageParams: { body: ["structured"] },
    });

    expect(captured[0].form.get("ContentVariables")).toBe(
      JSON.stringify({ "1": "structured" }),
    );
  });
});

describe("buildContentVariables", () => {
  it("maps positional params to 1-based string keys", () => {
    expect(buildContentVariables(["a", "b", "c"])).toBe(
      JSON.stringify({ "1": "a", "2": "b", "3": "c" }),
    );
  });

  it("prefers messageParams.body over params", () => {
    expect(buildContentVariables(["a"], { body: ["x", "y"] })).toBe(
      JSON.stringify({ "1": "x", "2": "y" }),
    );
  });

  it("returns null when there are no values", () => {
    expect(buildContentVariables()).toBeNull();
    expect(buildContentVariables([])).toBeNull();
    expect(buildContentVariables(undefined, {})).toBeNull();
  });
});

describe("translateTwilioStatus", () => {
  it("maps deliverable statuses onto the messages.status CHECK values", () => {
    expect(translateTwilioStatus("sent")).toBe("sent");
    expect(translateTwilioStatus("delivered")).toBe("delivered");
    expect(translateTwilioStatus("read")).toBe("read");
    expect(translateTwilioStatus("failed")).toBe("failed");
    expect(translateTwilioStatus("undelivered")).toBe("failed");
  });

  it("ignores pre-send lifecycle statuses", () => {
    expect(translateTwilioStatus("queued")).toBeNull();
    expect(translateTwilioStatus("accepted")).toBeNull();
    expect(translateTwilioStatus("sending")).toBeNull();
    expect(translateTwilioStatus("something-new")).toBeNull();
  });
});

describe("error mapping", () => {
  it("maps 63016 to the 24-hour session window message", async () => {
    captureFetch({ code: 63016, message: "raw twilio text" }, 400);
    await expect(
      sendTextMessage({ credentials: CREDENTIALS, to: "1", text: "x" }),
    ).rejects.toThrow(
      /Outside the 24-hour WhatsApp session window.*\(Twilio error 63016\)/,
    );
  });

  it("maps 21211 to an invalid-recipient message", async () => {
    captureFetch({ code: 21211, message: "raw" }, 400);
    await expect(
      sendTextMessage({ credentials: CREDENTIALS, to: "1", text: "x" }),
    ).rejects.toThrow(/Invalid recipient phone number/);
  });

  it("maps 20003 to an authentication message", async () => {
    captureFetch({ code: 20003, message: "Authenticate" }, 401);
    await expect(
      sendTextMessage({ credentials: CREDENTIALS, to: "1", text: "x" }),
    ).rejects.toThrow(/Twilio authentication failed/);
  });

  it("passes through unmapped codes with the Twilio message + code", async () => {
    captureFetch({ code: 21610, message: "Recipient opted out" }, 400);
    await expect(
      sendTextMessage({ credentials: CREDENTIALS, to: "1", text: "x" }),
    ).rejects.toThrow(/Recipient opted out \(Twilio error 21610\)/);
  });

  it("falls back to the HTTP status when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>oops</html>", { status: 500 })),
    );
    await expect(
      sendTextMessage({ credentials: CREDENTIALS, to: "1", text: "x" }),
    ).rejects.toThrow(/Twilio API error: 500/);
  });
});

describe("fetchTwilioMedia", () => {
  it("downloads bytes with Basic auth and returns buffer + contentType", async () => {
    let capturedAuth: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedAuth = (init.headers as Record<string, string>).Authorization;
        return new Response(Buffer.from("media-bytes"), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }),
    );

    const result = await fetchTwilioMedia({
      accountSid: CREDENTIALS.accountSid,
      authSecret: "secret-token",
      mediaUrl: `https://api.twilio.com/2010-04-01/Accounts/${CREDENTIALS.accountSid}/Messages/SM1/Media/ME123`,
    });

    expect(capturedAuth).toBe(
      "Basic " +
        Buffer.from(`${CREDENTIALS.accountSid}:secret-token`).toString(
          "base64",
        ),
    );
    expect(result.contentType).toBe("image/jpeg");
    expect(result.buffer.toString()).toBe("media-bytes");
  });

  it("throws on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    await expect(
      fetchTwilioMedia({
        accountSid: CREDENTIALS.accountSid,
        authSecret: "secret-token",
        mediaUrl: `https://api.twilio.com/2010-04-01/Accounts/${CREDENTIALS.accountSid}/Messages/SM1/Media/ME404`,
      }),
    ).rejects.toThrow(/media download failed: 404/);
  });

  it("refuses to send credentials to a non-Twilio host", async () => {
    const fetchSpy = vi.fn(neverFetch);
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      fetchTwilioMedia({
        accountSid: CREDENTIALS.accountSid,
        authSecret: "secret-token",
        mediaUrl: "https://attacker.example.com/media/ME1",
      }),
    ).rejects.toThrow(/non-Twilio media URL host/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses http URLs and other accounts' media paths", async () => {
    const fetchSpy = vi.fn(neverFetch);
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      fetchTwilioMedia({
        accountSid: CREDENTIALS.accountSid,
        authSecret: "secret-token",
        mediaUrl: `http://api.twilio.com/2010-04-01/Accounts/${CREDENTIALS.accountSid}/Messages/SM1/Media/ME1`,
      }),
    ).rejects.toThrow(/non-Twilio media URL host/);
    await expect(
      fetchTwilioMedia({
        accountSid: CREDENTIALS.accountSid,
        authSecret: "secret-token",
        mediaUrl:
          "https://api.twilio.com/2010-04-01/Accounts/AC99999999999999999999999999999999/Messages/SM1/Media/ME1",
      }),
    ).rejects.toThrow(/non-Twilio media URL host/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("twilioCredentialsFromConfig", () => {
  it("maps the whatsapp_config columns onto send credentials", () => {
    const credentials = twilioCredentialsFromConfig({
      config: {
        phone_number_id: "14155550100",
        twilio_account_sid: "AC1",
        twilio_api_key_sid: "SK1",
        twilio_messaging_service_sid: "MG1",
      },
      accessToken: "decrypted-secret",
    });
    expect(credentials).toEqual({
      accountSid: "AC1",
      apiKeySid: "SK1",
      authSecret: "decrypted-secret",
      fromNumber: "14155550100",
      messagingServiceSid: "MG1",
    });
  });

  it("throws when the Account SID is missing", () => {
    expect(() =>
      twilioCredentialsFromConfig({
        config: { phone_number_id: "1", twilio_account_sid: null },
        accessToken: "x",
      }),
    ).toThrow(/Account SID is missing/);
  });
});
