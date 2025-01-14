import { deleteProposer } from "../lib/graph";
import * as R from "ramda";
import { Client, Api, Model } from "@core/types";
import { clientAction } from "../handler";
import { stripEmptyRecursive, pickDefined } from "@core/lib/utils/object";
import {
  statusProducers,
  renameObjectProducers,
  removeObjectProducers,
  updateSettingsProducers,
  reorderStatusProducers,
} from "../lib/status";
import { log } from "@core/lib/utils/logger";
import {
  getOrgAccessScopeForGroupMembers,
  mergeAccessScopes,
} from "@core/lib/graph";

clientAction<
  Api.Action.RequestActions["CreateBlock"],
  Api.Net.ApiResultTypes["CreateBlock"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_BLOCK,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...statusProducers("isCreatingBlock", "createBlockError"),
});

clientAction<
  Api.Action.RequestActions["RenameBlock"],
  Api.Net.ApiResultTypes["RenameBlock"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.RENAME_BLOCK,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...renameObjectProducers,
});

clientAction<
  Api.Action.RequestActions["UpdateBlockSettings"],
  Api.Net.ApiResultTypes["UpdateBlockSettings"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.UPDATE_BLOCK_SETTINGS,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...updateSettingsProducers,
});

clientAction<
  Api.Action.RequestActions["DeleteBlock"],
  Api.Net.ApiResultTypes["DeleteBlock"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DELETE_BLOCK,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  encryptedKeysScopeFn: (graph, { payload: { id } }) => ({
    envParentIds: new Set([id]),
    userIds: "all",
    keyableParentIds: "all",
  }),
});

clientAction<
  Api.Action.RequestActions["DisconnectBlock"],
  Api.Net.ApiResultTypes["DisconnectBlock"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.DISCONNECT_BLOCK,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...removeObjectProducers,
  graphProposer: deleteProposer,
  encryptedKeysScopeFn: (graph, { payload: { id } }) => {
    const { appId, blockId } = graph[id] as Model.AppBlock;

    return {
      envParentIds: new Set([appId, blockId]),
      userIds: "all",
      keyableParentIds: "all",
    };
  },
});

clientAction<
  Api.Action.RequestActions["ReorderBlocks"],
  Api.Net.ApiResultTypes["ReorderBlocks"]
>({
  type: "apiRequestAction",
  actionType: Api.ActionType.REORDER_BLOCKS,
  loggableType: "orgAction",
  authenticated: true,
  graphAction: true,
  serialAction: true,
  ...reorderStatusProducers("appBlock"),
});

clientAction<Client.Action.ClientActions["ConnectBlocks"]>({
  type: "asyncClientAction",
  actionType: Client.ActionType.CONNECT_BLOCKS,
  serialAction: true,
  stateProducer: (draft, { payload }) => {
    for (let path of connectBlockStatusPaths(payload)) {
      draft.isConnectingBlocks = R.assocPath(
        path,
        true,
        draft.isConnectingBlocks
      );

      draft.connectBlocksErrors = R.dissocPath(path, draft.connectBlocksErrors);
    }

    draft.connectBlocksErrors = stripEmptyRecursive(draft.connectBlocksErrors);
  },
  failureStateProducer: (draft, { meta: { rootAction }, payload }) => {
    for (let path of connectBlockStatusPaths(rootAction.payload)) {
      draft.connectBlocksErrors = R.assocPath(
        path,
        {
          error: payload,
          payload: rootAction.payload,
        },
        draft.connectBlocksErrors
      );
    }
  },

  endStateProducer: (draft, { meta: { rootAction } }) => {
    for (let path of connectBlockStatusPaths(rootAction.payload)) {
      draft.isConnectingBlocks = R.dissocPath(path, draft.isConnectingBlocks);
    }
    draft.isConnectingBlocks = stripEmptyRecursive(draft.isConnectingBlocks);
  },

  bulkApiDispatcher: true,
  apiActionCreator: async (payload) => {
    const { appId, blockId, appGroupId, blockGroupId } = payload as any;

    type GrantAppAccessAction = Api.Action.GraphActions[
      | "ConnectBlock"
      | "CreateAppBlockGroup"
      | "CreateAppGroupBlock"
      | "CreateAppGroupBlockGroup"];

    let actionType: GrantAppAccessAction["type"];

    if (appId && blockId) {
      actionType = Api.ActionType.CONNECT_BLOCK;
    } else if (appId && blockGroupId) {
      actionType = Api.ActionType.CREATE_APP_BLOCK_GROUP;
    } else if (appGroupId && blockId) {
      actionType = Api.ActionType.CREATE_APP_GROUP_BLOCK;
    } else if (appGroupId && blockGroupId) {
      actionType = Api.ActionType.CREATE_APP_GROUP_BLOCK_GROUP;
    }

    return {
      action: {
        type: actionType!,
        payload: pickDefined(
          ["appId", "appGroupId", "blockId", "blockGroupId", "orderIndex"],
          payload as any
        ),
      },
    };
  },
});

const getGraphProposer =
  <ActionType extends Api.Action.GraphAction>(
    objectType:
      | "appBlock"
      | "appBlockGroup"
      | "appGroupBlock"
      | "appGroupBlockGroup"
  ): Client.GraphProposer<ActionType> =>
  (action) =>
  (graphDraft) => {
    const now = Date.now(),
      { appId, appGroupId, blockId, blockGroupId } = action.payload as any,
      proposalId = [appId, appGroupId, blockId, blockGroupId]
        .filter(Boolean)
        .join("|"),
      object = {
        type: objectType,
        id: proposalId,
        createdAt: now,
        updatedAt: now,
        ...pickDefined(
          ["appId", "appGroupId", "blockId", "blockGroupId", "orderIndex"],
          action.payload as any
        ),
      } as Client.Graph.UserGraphObject;

    graphDraft[proposalId] = object;
  };

clientAction<Api.Action.RequestActions["ConnectBlock"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CONNECT_BLOCK,
  bulkDispatchOnly: true,
  graphProposer:
    getGraphProposer<Api.Action.RequestActions["ConnectBlock"]>("appBlock"),
  encryptedKeysScopeFn: (graph, { payload: { appId, blockId } }) => ({
    envParentIds: new Set([appId, blockId]),
    userIds: "all",
    keyableParentIds: "all",
  }),
});

clientAction<Api.Action.RequestActions["CreateAppBlockGroup"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_APP_BLOCK_GROUP,
  bulkDispatchOnly: true,
  graphProposer:
    getGraphProposer<Api.Action.RequestActions["CreateAppBlockGroup"]>(
      "appBlockGroup"
    ),
  encryptedKeysScopeFn: (graph, { payload: { appId, blockGroupId } }) =>
    mergeAccessScopes(getOrgAccessScopeForGroupMembers(graph, blockGroupId), {
      userIds: "all",
      keyableParentIds: "all",
      envParentIds: new Set([appId]),
    }),
});

clientAction<Api.Action.RequestActions["CreateAppGroupBlock"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_APP_GROUP_BLOCK,
  bulkDispatchOnly: true,
  graphProposer:
    getGraphProposer<Api.Action.RequestActions["CreateAppGroupBlock"]>(
      "appGroupBlock"
    ),
  encryptedKeysScopeFn: (graph, { payload: { blockId, appGroupId } }) =>
    mergeAccessScopes(getOrgAccessScopeForGroupMembers(graph, appGroupId), {
      userIds: "all",
      keyableParentIds: "all",
      envParentIds: new Set([blockId]),
    }),
});

clientAction<Api.Action.RequestActions["CreateAppGroupBlockGroup"]>({
  type: "apiRequestAction",
  actionType: Api.ActionType.CREATE_APP_GROUP_BLOCK_GROUP,
  bulkDispatchOnly: true,
  graphProposer:
    getGraphProposer<Api.Action.RequestActions["CreateAppGroupBlockGroup"]>(
      "appGroupBlockGroup"
    ),
  encryptedKeysScopeFn: (graph, { payload: { blockGroupId, appGroupId } }) =>
    mergeAccessScopes(
      getOrgAccessScopeForGroupMembers(graph, appGroupId),
      getOrgAccessScopeForGroupMembers(graph, blockGroupId),
      {
        userIds: "all",
        keyableParentIds: "all",
      }
    ),
});

const connectBlockStatusPaths = (
  payload: Client.Action.ClientActions["ConnectBlocks"]["payload"]
) => {
  const res: string[][] = [];

  // index status by both app and block
  for (let params of payload) {
    let appTargetId: string, blockTargetId: string;
    if ("appId" in params) {
      appTargetId = params.appId;
    } else {
      appTargetId = params.appGroupId;
    }

    if ("blockId" in params) {
      blockTargetId = params.blockId;
    } else {
      blockTargetId = params.blockGroupId;
    }

    res.push([appTargetId, blockTargetId], [blockTargetId, appTargetId]);
  }

  return res;
};
