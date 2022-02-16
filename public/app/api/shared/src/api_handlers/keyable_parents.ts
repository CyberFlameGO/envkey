import { apiAction } from "../handler";
import { Api, Auth } from "@core/types";
import { v4 as uuid } from "uuid";
import {
  getActiveGeneratedEnvkeysByKeyableParentId,
  getDeleteKeyableParentProducer,
  deleteGraphObjects,
  authz,
  environmentCompositeId,
} from "@core/lib/graph";
import { pick } from "@core/lib/utils/pick";
import * as graphKey from "../graph_key";
import produce from "immer";
import { getPubkeyHash } from "@core/lib/client";
import { sha256 } from "@core/lib/crypto/utils";

apiAction<
  Api.Action.RequestActions["CreateServer"],
  Api.Net.ApiResultTypes["CreateServer"]
>({
  type: Api.ActionType.CREATE_SERVER,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async (
    { payload: { environmentId } },
    orgGraph,
    userGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    const numActive = Object.values(
      getActiveGeneratedEnvkeysByKeyableParentId(orgGraph)
    ).length;

    if (
      auth.license.maxServerEnvkeys != -1 &&
      numActive >= auth.license.maxServerEnvkeys
    ) {
      return false;
    }

    return authz.canCreateServer(userGraph, auth.user.id, environmentId);
  },
  graphHandler: async ({ type: actionType, payload }, orgGraph, auth, now) => {
    const id = uuid(),
      server: Api.Db.Server = {
        type: "server",
        id,
        ...graphKey.server(auth.org.id, payload.appId, id),
        ...pick(["appId", "environmentId", "name"], payload),
        createdAt: now,
        updatedAt: now,
      };

    const environment = orgGraph[server.environmentId] as Api.Db.Environment;

    return {
      type: "graphHandlerResult",
      handlerContext: {
        type: actionType,
        createdId: server.id,
      },
      graph: {
        ...orgGraph,
        [server.id]: server,
      },
      logTargetIds: [
        server.id,
        environment.envParentId,
        environment.environmentRoleId,
        environment.isSub ? environmentCompositeId(environment) : undefined,
      ].filter((id): id is string => Boolean(id)),
    };
  },
});

apiAction<
  Api.Action.RequestActions["DeleteServer"],
  Api.Net.ApiResultTypes["DeleteServer"]
>({
  type: Api.ActionType.DELETE_SERVER,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canDeleteServer(userGraph, auth.user.id, id),
  graphHandler: async (action, orgGraph, auth, now) => {
    const server = orgGraph[action.payload.id] as Api.Db.Server;
    const environment = orgGraph[server.environmentId] as Api.Db.Environment;

    const generatedEnvkey = getActiveGeneratedEnvkeysByKeyableParentId(
      orgGraph
    )[server.id] as Api.Db.GeneratedEnvkey | undefined;

    return {
      type: "graphHandlerResult",
      graph: produce(
        orgGraph,
        getDeleteKeyableParentProducer(action.payload.id, now)
      ),
      transactionItems: generatedEnvkey
        ? {
            hardDeleteScopes: [
              { pkey: "envkey|" + generatedEnvkey.envkeyIdPart },
            ],
          }
        : undefined,
      logTargetIds: [
        server.id,
        environment.envParentId,
        environment.environmentRoleId,
        environment.isSub ? environmentCompositeId(environment) : undefined,
      ].filter((id): id is string => Boolean(id)),
      clearEnvkeySockets: generatedEnvkey
        ? [
            {
              orgId: auth.org.id,
              generatedEnvkeyId: generatedEnvkey.id,
            },
          ]
        : undefined,
    };
  },
});

apiAction<
  Api.Action.RequestActions["CreateLocalKey"],
  Api.Net.ApiResultTypes["CreateLocalKey"],
  Auth.TokenAuthContext
>({
  type: Api.ActionType.CREATE_LOCAL_KEY,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async (
    { payload: { environmentId } },
    orgGraph,
    userGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    if (auth.type != "tokenAuthContext") {
      return false;
    }

    return authz.canCreateLocalKey(userGraph, auth.user.id, environmentId);
  },
  graphHandler: async ({ type: actionType, payload }, orgGraph, auth, now) => {
    const id = uuid(),
      localKey: Api.Db.LocalKey = {
        type: "localKey",
        id,
        ...graphKey.localKey(auth.org.id, payload.appId, id),
        ...pick(["appId", "environmentId", "name", "autoGenerated"], payload),
        userId: auth.user.id,
        deviceId: auth.orgUserDevice.id,
        createdAt: now,
        updatedAt: now,
      };

    const environment = orgGraph[localKey.environmentId] as Api.Db.Environment;

    return {
      type: "graphHandlerResult",
      handlerContext: {
        type: actionType,
        createdId: localKey.id,
      },
      graph: {
        ...orgGraph,
        [localKey.id]: localKey,
      },
      logTargetIds: [
        localKey.id,
        environment.envParentId,
        environment.environmentRoleId,
        "locals",
      ].filter((id): id is string => Boolean(id)),
    };
  },
});

apiAction<
  Api.Action.RequestActions["DeleteLocalKey"],
  Api.Net.ApiResultTypes["DeleteLocalKey"]
>({
  type: Api.ActionType.DELETE_LOCAL_KEY,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canDeleteLocalKey(userGraph, auth.user.id, id),
  graphHandler: async (action, orgGraph, auth, now) => {
    const localKey = orgGraph[action.payload.id] as Api.Db.LocalKey;
    const environment = orgGraph[localKey.environmentId] as Api.Db.Environment;

    const generatedEnvkey = getActiveGeneratedEnvkeysByKeyableParentId(
      orgGraph
    )[localKey.id] as Api.Db.GeneratedEnvkey | undefined;

    return {
      type: "graphHandlerResult",
      graph: produce(
        orgGraph,
        getDeleteKeyableParentProducer(action.payload.id, now)
      ),
      transactionItems: generatedEnvkey
        ? {
            hardDeleteScopes: [
              { pkey: "envkey|" + generatedEnvkey.envkeyIdPart },
            ],
          }
        : undefined,
      logTargetIds: [
        localKey.id,
        environment.envParentId,
        environment.environmentRoleId,
        "locals",
      ].filter((id): id is string => Boolean(id)),
      clearEnvkeySockets: generatedEnvkey
        ? [
            {
              orgId: auth.org.id,
              generatedEnvkeyId: generatedEnvkey.id,
            },
          ]
        : undefined,
    };
  },
});

apiAction<
  Api.Action.RequestActions["GenerateKey"],
  Api.Net.ApiResultTypes["GenerateKey"]
>({
  type: Api.ActionType.GENERATE_KEY,
  graphAction: true,
  authenticated: true,

  graphAuthorizer: async (
    { payload: { keyableParentId, keyableParentType } },
    orgGraph,
    userGraph,
    auth,
    now,
    requestParams,
    transactionConn
  ) => {
    if (keyableParentType == "server") {
      const numActive = Object.values(
        getActiveGeneratedEnvkeysByKeyableParentId(orgGraph)
      ).length;

      const existingEnvkey = getActiveGeneratedEnvkeysByKeyableParentId(
        orgGraph
      )[keyableParentId] as Api.Db.GeneratedEnvkey;

      if (
        auth.license.maxServerEnvkeys != -1 &&
        numActive - (existingEnvkey ? 1 : 0) >= auth.license.maxServerEnvkeys
      ) {
        return false;
      }
    }

    return authz.canGenerateKey(userGraph, auth.user.id, keyableParentId);
  },
  graphHandler: async (
    { type: actionType, payload, meta },
    orgGraph,
    auth,
    now
  ) => {
    let [updatedGraph, generatedEnvkey] = generateKey(
      orgGraph,
      auth,
      now,
      payload
    );

    const existingEnvkey = getActiveGeneratedEnvkeysByKeyableParentId(orgGraph)[
      payload.keyableParentId
    ] as Api.Db.GeneratedEnvkey | undefined;

    if (existingEnvkey) {
      updatedGraph = deleteGraphObjects(updatedGraph, [existingEnvkey.id], now);
    }

    const keyableParent = orgGraph[
      payload.keyableParentId
    ] as Api.Db.KeyableParent;
    const environment = orgGraph[
      keyableParent.environmentId
    ] as Api.Db.Environment;

    const logTargetIds = [
      generatedEnvkey.id,
      environment.envParentId,
      payload.keyableParentId,
      environment.environmentRoleId,
    ];

    if (keyableParent.type == "localKey") {
      logTargetIds.push("locals");
    } else if (environment.isSub) {
      logTargetIds.push(environmentCompositeId(environment));
    }

    return {
      type: "graphHandlerResult",
      graph: updatedGraph,
      handlerContext: {
        type: actionType,
        createdId: generatedEnvkey.id,
      },
      transactionItems: existingEnvkey
        ? {
            hardDeleteScopes: [
              { pkey: "envkey|" + existingEnvkey.envkeyIdPart },
            ],
          }
        : undefined,
      logTargetIds,
      clearEnvkeySockets: existingEnvkey
        ? [
            {
              orgId: auth.org.id,
              generatedEnvkeyId: existingEnvkey.id,
            },
          ]
        : undefined,
    };
  },
});

apiAction<
  Api.Action.RequestActions["RevokeKey"],
  Api.Net.ApiResultTypes["RevokeKey"]
>({
  type: Api.ActionType.REVOKE_KEY,
  graphAction: true,
  authenticated: true,
  graphAuthorizer: async ({ payload: { id } }, orgGraph, userGraph, auth) =>
    authz.canRevokeKey(userGraph, auth.user.id, { generatedEnvkeyId: id }),
  graphHandler: async ({ payload }, orgGraph, auth, now) => {
    const generatedEnvkey = orgGraph[payload.id] as Api.Db.GeneratedEnvkey;
    const keyableParent = orgGraph[
      generatedEnvkey.keyableParentId
    ] as Api.Db.KeyableParent;
    const environment = orgGraph[
      keyableParent.environmentId
    ] as Api.Db.Environment;

    const logTargetIds = [
      generatedEnvkey.id,
      generatedEnvkey.keyableParentId,
      environment.envParentId,
      environment.environmentRoleId,
    ];

    if (keyableParent.type == "localKey") {
      logTargetIds.push("locals");
    } else if (environment.isSub) {
      logTargetIds.push(environmentCompositeId(environment));
    }

    return {
      type: "graphHandlerResult",
      graph: deleteGraphObjects(orgGraph, [generatedEnvkey.id], now),
      transactionItems: generatedEnvkey
        ? {
            hardDeleteScopes: [
              { pkey: "envkey|" + generatedEnvkey.envkeyIdPart },
            ],
          }
        : undefined,
      logTargetIds,
      clearEnvkeySockets: [
        {
          orgId: auth.org.id,
          generatedEnvkeyId: generatedEnvkey.id,
        },
      ],
    };
  },
});

const generateKey = (
  orgGraph: Api.Graph.OrgGraph,
  auth: Auth.DefaultAuthContext,
  now: number,
  payload: Api.Net.ApiParamTypes["GenerateKey"]
): [Api.Graph.OrgGraph, Api.Db.GeneratedEnvkey] => {
  const keyableParent = orgGraph[
    payload.keyableParentId
  ] as Api.Db.KeyableParent;

  const id = uuid(),
    generatedEnvkey: Api.Db.GeneratedEnvkey = {
      type: "generatedEnvkey",
      id,
      ...graphKey.generatedEnvkey(
        auth.org.id,
        payload.appId,
        payload.envkeyIdPart
      ),
      ...pick(
        [
          "appId",
          "encryptedPrivkey",
          "envkeyIdPart",
          "keyableParentId",
          "keyableParentType",
          "pubkey",
          "envkeyIdPart",
        ],
        payload
      ),
      environmentId: keyableParent.environmentId,
      signedTrustedRoot: payload.signedTrustedRoot,
      trustedRootUpdatedAt: now,
      envkeyShort: payload.envkeyIdPart.substr(0, 6),
      envkeyIdPartHash: sha256(payload.envkeyIdPart),
      creatorId: auth.user.id,
      creatorDeviceId:
        auth.type == "tokenAuthContext" ? auth.orgUserDevice.id : undefined,
      signedById:
        auth.type == "tokenAuthContext" ? auth.orgUserDevice.id : auth.user.id,
      pubkeyId: getPubkeyHash(payload.pubkey),
      pubkeyUpdatedAt: now,
      blobsUpdatedAt: now,
      userId:
        keyableParent.type == "localKey" ? keyableParent.userId : undefined,
      deviceId:
        keyableParent.type == "localKey" ? keyableParent.deviceId : undefined,
      createdAt: now,
      updatedAt: now,
    };

  const org = orgGraph[auth.org.id] as Api.Db.Org;

  let updatedGraph: Api.Graph.OrgGraph = {
    ...orgGraph,
    [generatedEnvkey.id]: generatedEnvkey,
    [auth.org.id]:
      payload.keyableParentType == "server"
        ? {
            ...org,
            serverEnvkeyCount: org.serverEnvkeyCount + 1,
            updatedAt: now,
          }
        : org,
  };

  return [updatedGraph, generatedEnvkey];
};