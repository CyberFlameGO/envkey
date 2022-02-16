import { default as ActionType } from "./action_type";

export type ClearUserSocketParams =
  | {
      orgId: string;
    }
  | {
      orgId: string;
      userId: string;
    }
  | {
      orgId: string;
      userId: string;
      deviceId: string;
    };

export type ClearEnvkeySocketParams =
  | {
      orgId: string;
    }
  | {
      orgId: string;
      generatedEnvkeyId: string;
    };

export type OrgSocketUpdateMessage = {
  actorId?: string;
} & (
  | {
      otherUpdateReason?: undefined;
      actionTypes: ActionType[];
      meta?: undefined;
    }
  | {
      otherUpdateReason: "upgrade_success" | "upgrade_failed";
      actionTypes: [];
      meta: {
        apiVersion: string;
        infraVersion: string;
      };
    }
);

export type EnvkeySocketUpdateMessage = {
  type: "env_updated";
};

export type OrgSocketBroadcastFn = (
  orgId: string,
  msg: OrgSocketUpdateMessage,
  skipDeviceId?: string,
  scope?: {
    userIds?: string[];
    deviceIds?: string[];
  }
) => void;

export type EnvkeySocketBroadcastFn = (
  orgId: string,
  generatedEnvkeyId: string,
  msg: EnvkeySocketUpdateMessage
) => void;

export interface SocketServer {
  start: () => void;

  sendOrgUpdate: OrgSocketBroadcastFn;

  sendEnvkeyUpdate: EnvkeySocketBroadcastFn;

  clearOrgSockets: (orgId: string) => void;

  clearUserSockets: (orgId: string, userId: string) => void;

  clearDeviceSocket: (orgId: string, userId: string, deviceId: string) => void;

  clearOrgEnvkeySockets: (orgId: string) => void;

  clearEnvkeySockets: (orgId: string, generatedEnvkeyId: string) => void;
}