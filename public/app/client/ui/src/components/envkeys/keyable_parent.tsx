import React from "react";
import { OrgComponent } from "@ui_types";
import { Client, Model, Api, Billing } from "@core/types";
import * as g from "@core/lib/graph";
import { SmallLoader, SvgImage } from "@images";
import { twitterShortTs } from "@core/lib/utils/date";
import { capitalizeAll } from "humanize-plus";
import humanize from "humanize-string";
import { ExternalLink } from "../shared";

export const KeyableParent: OrgComponent<
  {},
  {
    keyableParent: Model.KeyableParent;
    justGenerated?: Client.GeneratedEnvkeyResult;
    generatedEnvkey?: Model.GeneratedEnvkey;
    copied?: boolean;
    onCopied: () => void;
    confirming?: boolean;
    confirmingType?: "remove" | "revoke" | "regen";
    onConfirm?: (confirmType: "remove" | "revoke" | "regen") => void;
    onCancelConfirm?: () => void;
    removing?: boolean;
    onRemove?: () => void;
    regenerating?: boolean;
    onRegenerate?: () => void;
    license?: Billing.License;
    licenseExpired?: boolean;
    numActive?: number;
    omitHelpCopy?: true;
    omitDoneButton?: true;
  }
> = (props) => {
  const { graph } = props.core;
  const currentUserId = props.ui.loadedAccountId!;
  const currentAccount = props.core.orgUserAccounts[currentUserId]!;
  const {
    keyableParent,
    justGenerated,
    generatedEnvkey,
    copied,
    onCopied,
    confirming,
    confirmingType,
    onConfirm,
    onCancelConfirm,
    removing,
    onRemove,
    regenerating,
    onRegenerate,
    license,
    licenseExpired,
    numActive,
    omitHelpCopy,
    omitDoneButton,
  } = props;

  const generatedBy = generatedEnvkey
    ? (graph[generatedEnvkey.creatorId] as Model.OrgUser | Model.CliUser)
    : undefined;

  const renderConfirm = () => {
    let label = "";
    if (!confirming) {
      return;
    }

    if (confirmingType == "remove") {
      label += "Remove " + capitalizeAll(humanize(keyableParent.type));
    } else if (confirmingType == "revoke") {
      label += "Revoke ENVKEY";
    } else if (confirmingType == "regen") {
      label += "Regenerate ENVKEY";
    }
    label += "?";

    return (
      <div className="actions confirm">
        <label>{label}</label>
        <span>
          <button className="secondary" onClick={onCancelConfirm}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={() => {
              if (confirmingType == "remove") {
                onRemove!();

                props.dispatch({
                  type:
                    keyableParent.type == "localKey"
                      ? Api.ActionType.DELETE_LOCAL_KEY
                      : Api.ActionType.DELETE_SERVER,
                  payload: { id: keyableParent.id },
                });
              } else if (confirmingType == "revoke") {
                props.dispatch({
                  type: Api.ActionType.REVOKE_KEY,
                  payload: { id: generatedEnvkey!.id },
                });
              } else if (confirmingType == "regen") {
                onRegenerate!();

                props.dispatch({
                  type: Client.ActionType.GENERATE_KEY,
                  payload: {
                    appId: keyableParent.appId,
                    keyableParentId: keyableParent.id,
                    keyableParentType: keyableParent.type,
                  },
                });
              }
              onCancelConfirm!();
            }}
          >
            Confirm
          </button>
        </span>
      </div>
    );
  };

  const renderRegenerate = () => {
    if (keyableParent.type == "localKey" && keyableParent.autoGenerated) {
      return "";
    }

    if (
      !g.authz.canRevokeKey(graph, currentUserId, {
        generatedEnvkeyId: generatedEnvkey!.id,
      })
    ) {
      return "";
    }

    return (
      <span className="regen" onClick={() => onConfirm!("regen")}>
        <SvgImage type="restore" />
        <span>Regenerate</span>
      </span>
    );
  };

  const renderRemove = () => {
    if (
      !(
        (keyableParent.type == "localKey" &&
          g.authz.canDeleteLocalKey(graph, currentUserId, keyableParent.id)) ||
        (keyableParent.type == "server" &&
          g.authz.canDeleteServer(graph, currentUserId, keyableParent.id))
      )
    ) {
      return "";
    }

    return (
      <span className="delete" onClick={() => onConfirm!("remove")}>
        <SvgImage type="x" />
        <span>Remove</span>
      </span>
    );
  };

  const renderActions = () => {
    if (justGenerated) {
      return (
        <div className="actions">
          <button
            className="primary"
            onClick={() => {
              const envkeyParts = [
                justGenerated.envkeyIdPart,
                justGenerated.encryptionKey,
              ];

              if (currentAccount.hostType == "self-hosted") {
                envkeyParts.push(currentAccount.hostUrl);
              }

              onCopied();

              props.dispatch({
                type: Client.ActionType.WRITE_CLIPBOARD,
                payload: {
                  value: `ENVKEY=${envkeyParts.join("-")}`,
                },
              });
            }}
          >
            Copy ENVKEY
          </button>
          {omitDoneButton ? (
            ""
          ) : (
            <button
              className="secondary"
              onClick={() => {
                props.dispatch({
                  type: Client.ActionType.CLEAR_GENERATED_ENVKEY,
                  payload: { keyableParentId: keyableParent.id },
                });
              }}
            >
              Done
            </button>
          )}
        </div>
      );
    }

    if (removing || regenerating) {
      return (
        <div className="actions">
          <SmallLoader />
        </div>
      );
    }

    if (confirming) {
      return renderConfirm();
    }

    const content: React.ReactNode[] = [renderRemove()];

    if (generatedEnvkey) {
      content.push(renderRegenerate());
    } else if (
      !(
        (license!.maxServerEnvkeys != -1 &&
          numActive! >= license!.maxServerEnvkeys) ||
        licenseExpired
      )
    ) {
      content.push(
        <button
          onClick={() => {
            props.dispatch({
              type: Client.ActionType.GENERATE_KEY,
              payload: {
                appId: keyableParent.appId,
                keyableParentId: keyableParent.id,
                keyableParentType: keyableParent.type,
              },
            });
          }}
        >
          Generate
        </button>
      );
    }

    return (
      <div
        className={"actions" + (removing || regenerating ? " disabled" : "")}
      >
        {content}
      </div>
    );
  };

  const renderEnvkey = () => {
    return (
      <span className="envkey">
        ENVKEY=
        {justGenerated
          ? justGenerated.envkeyIdPart.slice(0, 10)
          : generatedEnvkey!.envkeyShort}
        …{justGenerated && copied ? <small>Copied.</small> : ""}
      </span>
    );
  };

  return (
    <div className={justGenerated ? "generated-envkey" : ""}>
      <div>
        <span className="title">{keyableParent.name}</span>
        {generatedEnvkey && generatedBy ? (
          <span className="subtitle">
            {keyableParent.type == "localKey" && keyableParent.autoGenerated
              ? ["auto-generated", <span className="sep">{"●"}</span>]
              : ""}
            {keyableParent.type == "server"
              ? [
                  generatedBy.id == currentUserId
                    ? "you"
                    : g.getUserName(graph, generatedBy.id, true),
                  <span className="sep">{"●"}</span>,
                ]
              : ""}
            {twitterShortTs(generatedEnvkey.createdAt, props.ui.now)}
          </span>
        ) : (
          ""
        )}
      </div>

      {justGenerated && !omitHelpCopy ? (
        <div className="generated-envkey-copy">
          <label>ENVKEY Generated</label>
          <p>
            {keyableParent.type == "localKey"
              ? [
                  "Put it in a file at: ",
                  <br />,
                  <strong>$HOME/.envkey/apps/{keyableParent.appId}.env</strong>,
                  <br />,
                  <br />,
                  "Or put it in a file at: ",
                  <br />,
                  <strong>$HOME/.env</strong>,
                  <br />,
                  <br />,
                  "Or set it as an environment variable when running your app.",
                ]
              : [
                  "Set it as an ",
                  <strong>environment variable</strong>,
                  " on your server ",
                  <strong>OR</strong>,
                  " put it in a file at: ",
                  <br />,
                  <strong>$HOME/.env</strong>,
                  <br />,
                  <br />,
                  "To enable multiple ENVKEYs on one server, instead put it in a file at: ",
                  <br />,
                  <strong>$HOME/.envkey/apps/{keyableParent.appId}.env</strong>,
                ]}
            <br />
            <br />
            <strong>Keep it safe,</strong> don't check it in to version control,
            and don't share it.
            <br />
            <br />
            <ExternalLink
              {...props}
              to="https://docs-v2.envkey.com/integration-quickstart"
            >
              Integration Quickstart →
            </ExternalLink>
          </p>
        </div>
      ) : (
        ""
      )}

      <div>
        {renderEnvkey()}
        {renderActions()}
      </div>
    </div>
  );
};