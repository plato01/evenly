// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * EvenlyAnchor — minimal on-chain anchor for the Evenly expense app.
 *
 * Evenly is offline-first; the source of truth is local SQLite + Supabase. This
 * contract lets the app write a permanent, verifiable record of an expense or
 * group onto Monad. The relayer (a sponsor wallet that pays gas) calls
 * `anchor(...)` on the user's behalf, so end users never need a wallet or MON.
 *
 * We store nothing (keeps gas minimal) and instead emit an event carrying a
 * small, human-readable JSON payload as `data`. A block explorer decodes the
 * event and shows the original record. `recordId` is the app's UUID for the
 * expense/group; `kind` is "expense" or "group".
 */
contract EvenlyAnchor {
    /// Emitted once per anchored record. `data` is UTF-8 JSON as bytes.
    event Anchored(
        address indexed relayer,
        string recordId,
        string kind,
        bytes data,
        uint256 timestamp
    );

    /// Total number of records anchored — a cheap public counter for demos.
    uint256 public anchorCount;

    /**
     * Anchor one record. Anyone can call it (the relayer normally does); the
     * emitted event is the permanent proof. Returns nothing — the tx hash and
     * event are the receipt.
     */
    function anchor(
        string calldata recordId,
        string calldata kind,
        bytes calldata data
    ) external {
        unchecked {
            anchorCount++;
        }
        emit Anchored(msg.sender, recordId, kind, data, block.timestamp);
    }
}
