import { Db as _Db } from "./db";
import { Net as _Net } from "./net";
import { Action as _Action } from "./action";
import { default as _ActionType } from "./action_type";
import { Graph as _Graph } from "./graph";
import { Env as _Env } from "./env";
import { HandlerContext as _HandlerContext } from "./handler_context";
import Client from "../client";
import { Auth } from "../auth";
import { Blob } from "../blob";
import { Crypto } from "../crypto";
import * as Rbac from "../rbac";
import mysql from "mysql2/promise";
import { Billing } from "..";
import { Model } from "..";
import * as Socket from "./socket";

namespace Api {
  export import Db = _Db;
  export import Net = _Net;
  export import Action = _Action;
  export import ActionType = _ActionType;
  export import Graph = _Graph;

  export type Env = _Env;
  export type HandlerContext = _HandlerContext;

  export type ClearUserSocketParams = Socket.ClearUserSocketParams;
  export type ClearEnvkeySocketParams = Socket.ClearEnvkeySocketParams;
  export type OrgSocketUpdateMessage = Socket.OrgSocketBroadcastFn;
  export type EnvkeySocketUpdateMessage = Socket.EnvkeySocketUpdateMessage;
  export type OrgSocketBroadcastFn = Socket.OrgSocketBroadcastFn;
  export type EnvkeySocketBroadcastFn = Socket.EnvkeySocketBroadcastFn;
  export type SocketServer = Socket.SocketServer;

  export class ApiError extends Error {
    code: number;
    constructor(message: string, code: number) {
      super(message);
      this.code = code;
      return this;
    }
  }

  export type GraphResponseType =
    | "diffs"
    | "graph"
    | "loadedInvite"
    | "loadedDeviceGrant"
    | "loadedRecoveryKey"
    | "envsAndOrChangesets"
    | "session"
    | "ok"
    | "scimUserCandidate";

  export type HandlerPostUpdateActions = (() => Promise<any>)[];

  export type HandlerEnvsResponse =
    | {
        all: true;
        scopes?: undefined;
      }
    | {
        all?: undefined;
        scopes?: Blob.ScopeParams[];
      };

  export type HandlerChangesetsResponse = HandlerEnvsResponse &
    Net.FetchChangesetOptions;

  type HandlerResultBase = {
    logTargetIds: string[] | ((response: Api.Net.ApiResult) => string[]);
    backgroundLogTargetIds?:
      | string[]
      | ((response: Api.Net.ApiResult) => string[]);
    handlerContext?: HandlerContext;
    transactionItems?: Db.ObjectTransactionItems;
    postUpdateActions?: HandlerPostUpdateActions;
    responseBytes?: number;
  };

  export type GraphScopeFn<
    T extends Action.RequestAction = Action.RequestAction,
    AuthContextType extends Auth.AuthContext = Auth.AuthContext
  > = (
    auth: AuthContextType,
    action: T
  ) => (orgGraph?: Graph.OrgGraph) => string[];

  export type GraphHandlerResult<
    ResponseType extends Net.ApiResult = Net.ApiResult
  > = HandlerResultBase &
    (
      | {
          type: "graphHandlerResult";
          graph: Graph.OrgGraph;
          deleteBlobs?: Blob.KeySet;
          requireBlobs?: Blob.KeySet;
          envs?: HandlerEnvsResponse;
          changesets?: HandlerEnvsResponse;
          signedTrustedRoot?: Crypto.SignedData;
          encryptedKeysScope?: Rbac.OrgAccessScope;
          clearUserSockets?: ClearUserSocketParams[];
          clearEnvkeySockets?: ClearEnvkeySocketParams[];
          updatedGeneratedEnvkeyIds?: string[];
        }
      | {
          type: "response";
          response: ResponseType;
        }
    );

  export type HandlerResult<
    ResponseType extends Net.ApiResult = Net.ApiResult
  > = HandlerResultBase & {
    type: "handlerResult";
    response: ResponseType;
  };

  export type RequestParams = {
    ip: string;
    host: string;
    method: "post" | "get" | "head" | "patch" | "delete";
  };

  export type ApiActionParams<
    T extends Action.RequestAction = Action.RequestAction,
    ResponseType extends Net.ApiResult = Net.ApiResult,
    AuthContextType extends Auth.AuthContext = Auth.AuthContext
  > = {
    type: T["type"];
  } & (
    | {
        authenticated: true;
        graphAction: true;
        shouldClearOrphanedLocals?: true;
        skipGraphUpdatedAtCheck?: true;
        graphResponse?: GraphResponseType; // default "diffs"
        rbacUpdate?: true;
        reorderBlobsIfNeeded?: true;
        broadcastAdditionalOrgSocketIds?: string[];
        graphScopes?: GraphScopeFn<T, AuthContextType>[];
        graphAuthorizer?: (
          action: T,
          orgGraph: Graph.OrgGraph,
          userGraph: Client.Graph.UserGraph,
          auth: AuthContextType,
          now: number,
          requestParams: RequestParams,
          transactionConn: mysql.PoolConnection
        ) => Promise<boolean>;
        graphHandler?: (
          action: T,
          orgGraph: Graph.OrgGraph,
          auth: AuthContextType,
          now: number,
          requestParams: RequestParams,
          transactionConn: mysql.PoolConnection,
          socketServer: Api.SocketServer
        ) => Promise<GraphHandlerResult<ResponseType>>;
      }
    | {
        graphAction: false;
        authenticated: true;
        broadcastOrgSocket?:
          | true
          | ((action: T) =>
              | boolean
              | {
                  userIds: string[];
                }
              | {
                  deviceIds: string[];
                });
        authorizer?: (
          action: T,
          auth: AuthContextType,
          transactionConn: mysql.PoolConnection
        ) => Promise<boolean>;
        handler: (
          action: T,
          auth: AuthContextType,
          now: number,
          requestParams: RequestParams,
          transactionConn: mysql.PoolConnection
        ) => Promise<HandlerResult<ResponseType>>;
      }
    | {
        graphAction: false;
        authenticated: false;
        handler: (
          action: T,
          now: number,
          requestParams: RequestParams,
          transactionConn: mysql.PoolConnection
        ) => Promise<HandlerResult<ResponseType>>;
      }
  );

  export type ReplicationFn = (
    updatedOrg: Api.Db.Org,
    updatedOrgGraph: Api.Graph.OrgGraph,
    now: number
  ) => Promise<void>;

  export type UpdateOrgStatsFn = (
    auth: Auth.AuthContext | undefined,
    handlerContext: HandlerContext | undefined,
    requestBytes: number,
    responseBytes: number,
    updatedOrgGraph: boolean,
    now: number
  ) => Promise<void>;

  export type ThrottleRequestFn = (
    orgStats: Model.OrgStats,
    license: Billing.License,
    requestBytes: number,
    hasBlobParams: boolean
  ) => Promise<void>;

  export type ThrottleResponseFn = (
    orgStats: Model.OrgStats,
    license: Billing.License,
    responseBytes: number
  ) => Promise<void>;

  export type VerifyLicenseFn = (
    orgId: string,
    signedLicense: string | undefined,
    now: number,
    enforceExpiration?: boolean
  ) => Billing.License;
}

export default Api;