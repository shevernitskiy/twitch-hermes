/**
 * Twitch Hermes WebSocket & PubSub TypeScript Definitions
 *
 * Pure type definitions (zero runtime code):
 * - Hermes WebSocket protocol envelopes
 * - Typed PubSub event payloads
 * - Known topic prefixes annotated with auth requirements & subscription formats
 * - Known PubSub inner event `type` discriminators
 */

// ============================================================================
// Hermes WebSocket Protocol Messages
// ============================================================================

export interface HermesMessageBase {
  type: string;
  id: string;
  timestamp: string;
}

export interface HermesMessageWelcome extends HermesMessageBase {
  type: "welcome";
  welcome: {
    keepaliveSec: number;
    recoveryUrl: string;
    sessionId: string;
  };
}

export interface HermesMessageSubscribeResponse extends HermesMessageBase {
  type: "subscribeResponse";
  parentId: string;
  subscribeResponse: {
    subscription: { id: string };
    result: string;
    /** Client-side convenience field (not part of the raw Hermes message). */
    topic: string;
  };
}

export interface HermesMessageUnsubscribeResponse extends HermesMessageBase {
  type: "unsubscribeResponse";
  parentId: string;
  unsubscribeResponse: {
    subscription: { id: string };
    result: string;
  };
}

export interface HermesMessageAuthenticateResponse extends HermesMessageBase {
  type: "authenticateResponse";
  parentId: string;
  authenticateResponse: {
    result: string;
  };
}

export interface HermesMessageKeepalive extends HermesMessageBase {
  type: "keepalive";
}

export interface HermesMessageReconnect extends HermesMessageBase {
  type: "reconnect";
  reconnect: {
    url: string;
  };
}

export interface HermesMessageNotification extends HermesMessageBase {
  type: "notification";
  notification: {
    subscription: { id: string };
    type: string;
  };
}

export interface HermesMessagePubsub extends HermesMessageNotification {
  notification: {
    subscription: { id: string };
    type: "pubsub";
    /** JSON-serialized PubSub event payload. */
    pubsub: string;
  };
}

export type HermesMessage =
  | HermesMessageWelcome
  | HermesMessageSubscribeResponse
  | HermesMessageUnsubscribeResponse
  | HermesMessageAuthenticateResponse
  | HermesMessageKeepalive
  | HermesMessageReconnect
  | HermesMessageNotification
  | HermesMessagePubsub;

export interface HermesMessageAuthenticate extends HermesMessageBase {
  type: "authenticate";
  authenticate: {
    token: string;
  };
}

export interface HermesMessageSubscribe extends HermesMessageBase {
  type: "subscribe";
  subscribe: {
    id: string;
    type: "pubsub";
    pubsub: {
      topic: string;
    };
  };
}

export interface HermesMessageUnsubscribe extends HermesMessageBase {
  type: "unsubscribe";
  unsubscribe: {
    id: string;
  };
}

export type HermesClientMessage =
  HermesMessageAuthenticate | HermesMessageSubscribe | HermesMessageUnsubscribe;

// ============================================================================
// Typed PubSub Event Payloads
// ============================================================================

/**
 * Topic: `ads.<channelId>` (`NONE`)
 *
 * Also emits `"ads-schedule-update"`.
 */
export type AdsEvent = MidrollRequestEvent;

export interface MidrollRequestEvent {
  type: "midroll_request";
  data: {
    commercial_id: string;
    jitter_buckets: number;
    jitter_time: number;
    warmup_time: number;
    weighted_buckets: number[];
  };
}

/** Topic: `broadcast-settings-update.<channelId>` (`NONE`) */
export interface BroadcastSettingsUpdateEvent {
  channel_id: string;
  type: "broadcast_settings_update";
  channel: string;
  old_status: string;
  status: string;
  old_game: string;
  game: string;
  old_game_id: number;
  game_id: number;
}

/**
 * Topic: `celebration-events-v1.<channelId>` (`NONE`)
 *
 * Also emits `"celebrations_message"`.
 */
export type CelebrationEvent = AlertSetsCelebrationEvent;

export interface AlertSetsCelebrationEvent {
  type: "alert_sets_celebration";
  data: {
    type: "FLAMETHROWER" | (string & {});
    area: "EVERYWHERE" | (string & {});
    intensity: "CUTE" | (string & {});
    duration: number;
    alert_event_id: string;
    celebration_source: "alert_sets" | (string & {});
  };
}

/**
 * Topic: `channel-sub-gifts-v1.<channelId>` (`NONE`)
 *
 * Also emits `"gift-event"`.
 */
export type ChannelSubGiftsEvent = MysteryGiftPurchaseEvent;

export interface MysteryGiftPurchaseEvent {
  type: "mystery-gift-purchase";
  count: number;
  tier: "1000" | "2000" | "3000" | (string & {});
  user_id: string;
  channel_id: string;
  uuid: string;
  user_name: string;
  display_name: string;
  gift_theme: string;
  gift_to_live_followers: boolean;
}

/**
 * Topic: `community-points-channel-v1.<channelId>` (`NONE`)
 *
 * Other event types emitted on Community Points channel topic:
 * `"custom-reward-created"`, `"custom-reward-deleted"`,
 * `"redemption-status-update"`, `"update-redemption-statuses-progress"`,
 * `"update-redemption-statuses-finished"`, `"automatic-reward-redeemed"`,
 * `"automatic-reward-updated"`, `"community-goal-created"`,
 * `"community-goal-updated"`, `"community-goal-deleted"`,
 * `"active-multipliers-updated"`, `"channel-settings-update"`.
 */
export type CommunityPointsChannelEvent =
  | CommunityGoalContributionEvent
  | CustomRewardUpdatedEvent
  | RewardRedeemedEvent;

export interface CommunityPointsCustomReward {
  id: string;
  channel_id: string;
  title: string;
  prompt: string;
  cost: number;
  bits_cost: number;
  pricing_type: "POINTS" | (string & {});
  is_user_input_required: boolean;
  is_sub_only: boolean;
  image: {
    url_1x: string;
    url_2x: string;
    url_4x: string;
  } | null;
  default_image: {
    url_1x: string;
    url_2x: string;
    url_4x: string;
  };
  background_color: string;
  is_enabled: boolean;
  is_paused: boolean;
  is_in_stock: boolean;
  max_per_stream: {
    is_enabled: boolean;
    max_per_stream: number;
  };
  should_redemptions_skip_request_queue: boolean;
  template_id: string | null;
  updated_for_indicator_at: string;
  max_per_user_per_stream: {
    is_enabled: boolean;
    max_per_user_per_stream: number;
  };
  global_cooldown: {
    is_enabled: boolean;
    global_cooldown_seconds: number;
  };
  redemptions_redeemed_current_stream: number | null;
  cooldown_expires_at: string | null;
}

export interface CommunityGoalContributionEvent {
  type: "community-goal-contribution";
  data: {
    timestamp: string;
    contribution: {
      channel_id: string;
      goal: {
        id: string;
        channel_id: string;
        title: string;
        description: string;
        goal_type: "CREATOR" | (string & {});
        is_in_stock: boolean;
        goal_amount: number;
        points_contributed: number;
        small_contribution: number;
        per_stream_maximum_user_contribution: number;
        status: "STARTED" | "ENDED" | "FULFILLED" | (string & {});
        duration_days: number;
        started_at: string;
        ended_at: string;
        background_color: string;
        default_image: {
          url_1x: string;
          url_2x: string;
          url_4x: string;
        };
        image: {
          url_1x: string;
          url_2x: string;
          url_4x: string;
        } | null;
      };
      user: {
        id: string;
        login: string;
        display_name: string;
      };
      amount: number;
      stream_contribution: number;
      total_contribution: number;
    };
  };
}

export interface CustomRewardUpdatedEvent {
  type: "custom-reward-updated";
  data: {
    timestamp: string;
    updated_reward: CommunityPointsCustomReward;
  };
}

export interface RewardRedeemedEvent {
  type: "reward-redeemed";
  data: {
    timestamp: string;
    redemption: {
      id: string;
      user: {
        id: string;
        login: string;
        display_name: string;
      };
      channel_id: string;
      redeemed_at: string;
      reward: CommunityPointsCustomReward;
      user_input?: string;
      status: "FULFILLED" | "UNFULFILLED" | "CANCELED" | (string & {});
      cursor: string;
    };
  };
}

/**
 * Topic: `community-points-user-v1.<userId>` (`OAUTH`)
 *
 * Other event types emitted on Community Points topics:
 * `"points-spent"`, `"reward-redeemed"`,
 * `"redemption-status-update"`, `"update-redemption-statuses-progress"`,
 * `"update-redemption-statuses-finished"`, `"custom-reward-created"`,
 * `"custom-reward-updated"`, `"custom-reward-deleted"`,
 * `"automatic-reward-redeemed"`, `"automatic-reward-updated"`,
 * `"community-goal-created"`, `"community-goal-updated"`,
 * `"community-goal-deleted"`, `"community-goal-contribution"`,
 * `"active-multipliers-updated"`, `"channel-settings-update"`,
 * `"channel-last-viewed-content-updated"`, `"global-last-viewed-content-updated"`.
 */
export type CommunityPointsUserEvent =
  PointsEarnedEvent | ClaimAvailableEvent | ClaimClaimedEvent;

export interface PointsEarnedEvent {
  type: "points-earned";
  data: {
    timestamp: string;
    channel_id: string;
    point_gain: {
      user_id: string;
      channel_id: string;
      total_points: number;
      baseline_points: number;
      reason_code: "WATCH" | "WATCH_STREAK" | (string & {});
      multipliers: unknown[];
    };
    balance: {
      user_id: string;
      channel_id: string;
      balance: number;
    };
  };
}

export interface ClaimAvailableEvent {
  type: "claim-available";
  data: {
    timestamp: string;
    claim: {
      id: string;
      user_id: string;
      channel_id: string;
      point_gain: {
        user_id: string;
        channel_id: string;
        total_points: number;
        baseline_points: number;
        reason_code: "CLAIM" | (string & {});
        multipliers: unknown[];
      };
      created_at: string;
    };
  };
}

export interface ClaimClaimedEvent {
  type: "claim-claimed";
  data: {
    timestamp: string;
    claim: {
      id: string;
      user_id: string;
      channel_id: string;
      point_gain: {
        user_id: string;
        channel_id: string;
        total_points: number;
        baseline_points: number;
        reason_code: "CLAIM" | (string & {});
        multipliers: unknown[];
      };
      created_at: string;
    };
  };
}

/** Topic: `content-classification-labels-v1.<channelId>` (`NONE`) */
export type ContentClassificationLabelsEvent = ChannelCclsUpdatedEvent;

export interface ChannelCclsUpdatedEvent {
  type: "channel-ccls-updated";
  jitter: number;
  content_classification_labels: {
    label_id:
      | "DebatedSocialIssuesAndPolitics"
      | "DrugsIntoxication"
      | "Gambling"
      | "MatureGame"
      | "ProfanityVulgarity"
      | "SexualThemes"
      | "ViolentGraphic"
      | (string & {});
    localized_name: Record<string, string>;
  }[];
}

/**
 * Topic: `creator-goals-events-v1.<channelId>` (`NONE`)
 *
 * Other goal lifecycle event types: `"goal_created"`, `"goal_achieved"`, `"goal_finished"`.
 */
export type CreatorGoalsEvent = GoalUpdatedEvent;

export interface GoalUpdatedEvent {
  type: "goal_updated";
  data: {
    goal: {
      id: string;
      contributionType: string;
      state: string;
      description: string;
      currentContributions: number;
      targetContributions: number;
      progressBarAccentColor: string;
      progressBarBackgroundColor: string;
      createdAt: string;
      shouldAutoIncrement: boolean;
    };
    contributor: {
      displayName: string;
      isAnonymous: boolean;
    };
  };
}

/**
 * Topic: `hype-train-events-v2.<channelId>` (`NONE`)
 *
 * Other Hype Train event types: `"hype-train-cooldown-expiration"`,
 * `"hype-train-shared-channel-left"`, `"hype-train-shared-conversion"`,
 * `"hype-train-shared-merge-trains"`.
 */
export type HypeTrainEvent =
  | HypeTrainApproachingEvent
  | HypeTrainStartEvent
  | HypeTrainConductorUpdateEvent
  | HypeTrainLevelUpEvent
  | HypeTrainProgressionEvent
  | HypeTrainEndEvent;

export interface HypeTrainRewardItem {
  type: "EMOTE" | (string & {});
  id: string;
  group_id: string;
  reward_level: number;
  set_id: string;
  token: string;
  reward_end_date: string;
}

export interface HypeTrainPotentialReward {
  __typename: "HypeTrainPotentialReward";
  id: string;
  level: number;
  value: {
    __typename: "HypeTrainEmoteReward";
    id: string;
    type: "EMOTE" | (string & {});
    emote: {
      __typename: "Emote";
      id: string;
      token: string;
    };
  };
}

export interface HypeTrainCompactProgress {
  level: {
    value: number;
    goal: number;
    rewards: HypeTrainRewardItem[];
  };
  value: number;
  goal: number;
  total: number;
  remaining_seconds: number;
  all_time_high_state: "NONE" | (string & {});
}

export interface HypeTrainExecution {
  __typename: "HypeTrainExecution";
  id: string;
  startedAt: string;
  expiresAt: string;
  updatedAt: string;
  endedAt: string | null;
  endReason: "IN_PROGRESS" | (string & {});
  isGoldenKappaTrain: boolean;
  progress: {
    __typename: "HypeTrainProgress";
    id: string;
    goal: number;
    progression: number;
    total: number;
    level: {
      __typename: "HypeTrainLevel";
      id: string;
      value: number;
      goal: number;
      rewards: {
        __typename: "HypeTrainEmoteReward";
        id: string;
        type: "EMOTE" | (string & {});
        emote: {
          __typename: "Emote";
          id: string;
          token: string;
        };
      }[];
    };
    allTimeHighState: "NONE" | (string & {});
  };
  conductors: {
    __typename: "HypeTrainConductor";
    id: string;
    source: "SUBS" | "BITS" | "EXPLICIT_PURCHASE" | (string & {});
    participation: {
      __typename: "HypeTrainParticipation";
      source: "SUBS" | "BITS" | "EXPLICIT_PURCHASE" | (string & {});
      action: string;
      quantity: number;
    }[];
    user: {
      __typename: "User";
      id: string;
      displayName: string;
      login: string;
      profileImageURL: string;
    };
  }[];
  config: {
    __typename: "HypeTrainConfig";
    id: string;
    willUseCreatorColor: boolean;
    primaryHexColor: string;
    conductorRewards: {
      __typename: "HypeTrainConductorReward";
      source: "SUBS" | "EXPLICIT_PURCHASE" | "BITS" | (string & {});
      type: "CURRENT" | "FORMER" | (string & {});
      rewards: {
        __typename: "HypeTrainBadgeReward";
        id: string;
        type: "BADGE" | (string & {});
        badge: {
          __typename: "Badge";
          id: string;
          setID: string;
          imageURL: string;
        };
      }[];
    }[];
    participationConversionRates: {
      __typename: "HypeTrainParticipationConversionRate";
      action: string;
      source: string;
      value: number;
    }[];
    calloutEmote: {
      __typename: "Emote";
      id: string;
      token: string;
    } | null;
    difficulty:
      "EASY" | "MEDIUM" | "HARD" | "SUPER_HARD" | "INSANE" | (string & {});
    difficultySettings: {
      __typename: "HypeTrainDifficultySettings";
      difficulty: string;
      maxLevel: number;
    }[];
    potentialRewards: HypeTrainPotentialReward[];
    kickoff: {
      __typename: "HypeTrainKickoffConfig";
      minPoints: number;
    };
  };
  allTimeHigh: {
    __typename: "HypeTrainCompleted";
    goal: number;
    progression: number;
    total: number;
    level: {
      __typename: "HypeTrainLevel";
      id: string;
      value: number;
    };
  } | null;
  isFastMode: boolean;
  participations: {
    __typename: "HypeTrainParticipation";
    source: "SUBS" | "BITS" | "EXPLICIT_PURCHASE" | (string & {});
    action: string;
    quantity: number;
  }[];
  sharedHypeTrainDetails: unknown | null;
  isTreasureTrain: boolean;
  variantTrainDetails: unknown | null;
  pinataParentTrainID: string | null;
}

export interface HypeTrainApproachingEvent {
  type: "hype-train-approaching";
  data: {
    channel_id: string;
    goal: number;
    events_remaining_durations: Record<string, number>;
    level_one_rewards: HypeTrainRewardItem[];
    creator_color: string;
    participants: string[];
    approaching_hype_train_id: string;
    is_golden_kappa_train: boolean;
    expires_at: string;
    potential_rewards: HypeTrainPotentialReward[];
    is_treasure_train: boolean;
    is_boost_train: boolean;
    hype_train_type: "regular" | (string & {});
  };
}

export interface HypeTrainStartEvent {
  type: "hype-train-start";
  data: HypeTrainExecution;
}

export interface HypeTrainConductorUpdateEvent {
  type: "hype-train-conductor-update";
  data: {
    id: string;
    source: "SUBS" | "BITS" | "EXPLICIT_PURCHASE" | (string & {});
    user: {
      id: string;
      login: string;
      display_name: string;
      profile_image_url: string;
    };
    participations: Record<string, number>;
  };
}

export interface HypeTrainLevelUpEvent {
  type: "hype-train-level-up";
  data: {
    time_to_expire: number;
    progress: HypeTrainCompactProgress;
    hype_train: HypeTrainExecution;
    is_boost_train: boolean;
  };
}

export interface HypeTrainProgressionEvent {
  type: "hype-train-progression";
  data: {
    id: string;
    user_id: string;
    user_login: string;
    user_display_name: string;
    user_profile_image_url: string;
    sequence_id: number;
    action: string;
    source: "SUBS" | "BITS" | "EXPLICIT_PURCHASE" | (string & {});
    quantity: number;
    progress: HypeTrainCompactProgress;
    initiator_currency: unknown | null;
    is_fast_mode: boolean;
    expires_at: string;
    sharedProgress: unknown | null;
    is_large_event: boolean;
    is_boost_train: boolean;
    treasureTrainDetails: unknown | null;
    variantTrainDetails: unknown | null;
  };
}

export interface HypeTrainEndEvent {
  type: "hype-train-end";
  data: {
    id: string;
    ended_at: number;
    ending_reason: "COMPLETED" | "EXPIRED" | (string & {});
    participation_totals: {
      source: "SUBS" | "BITS" | "EXPLICIT_PURCHASE" | (string & {});
      action: string;
      quantity: number;
    }[];
    rewards: {
      __typename: "HypeTrainEmoteReward";
      id: string;
      type: "EMOTE" | (string & {});
      emote: {
        __typename: "Emote";
        id: string;
        token: string;
      };
    }[];
    shared_train_details: unknown | null;
    is_boost_train: boolean;
  };
}

/**
 * Topic: `leaderboard-events-v1.<subtopic>` (`NONE`)
 * (e.g. `leaderboard-events-v1.clips-<channelId>`, `leaderboard-events-v1.sub-gifts-sent-<channelId>-MONTH`)
 *
 * Note: `sub-gifts-sent` and `bits-usage-by-channel-v1` payloads omit the inner `type` discriminator.
 */
export type LeaderboardEvent =
  ClipsLeaderboardUpdateEvent | LeaderboardUpdateEvent;

export interface ClipsLeaderboardUpdateEvent {
  type: "clips-leaderboard-update";
  broadcaster_id: string;
  time_unit: "DAY" | "WEEK" | "MONTH" | "ALL_TIME" | (string & {});
  end_time: number;
  new_leaderboard: {
    rank: number;
    curator_id: string;
    curator_display_name: string;
    curator_login: string;
    clip_id: string;
    clip_slug: string;
    clip_asset_id: string;
    clip_title: string;
    clip_thumbnail_url: string;
    clip_url: string;
    score: number;
  }[];
}

export interface LeaderboardUpdateEvent {
  type?: never;
  identifier: {
    domain: "sub-gifts-sent" | "bits-usage-by-channel-v1" | (string & {});
    grouping_key: string;
    time_aggregation_unit:
      "DAY" | "WEEK" | "MONTH" | "ALL_TIME" | (string & {});
    time_bucket: string;
  };
  top: {
    rank: number;
    score: number;
    entry_key: string;
  }[];
  entry_context: {
    entry: {
      rank: number;
      score: number;
      entry_key: string;
      moderated?: boolean;
    };
    context: {
      rank: number;
      score: number;
      entry_key: string;
    }[];
  };
  event: {
    domain: "sub-gifts-sent" | "bits-usage-by-channel-v1" | (string & {});
    id: string;
    time_of_event: number;
    grouping_key: string;
    entry_key: string;
    event_value: number;
    metadata: {
      display_name: string;
      login: string;
    };
  };
  processed_at: number;
  entry_old_rank: number;
  entry_new_rank: number;
  entry_old_rank_context: {
    rank: number;
    score: number;
    entry_key: string;
    moderated: boolean;
    display_name: string;
    login: string;
  }[];
  entry_new_rank_context: {
    rank: number;
    score: number;
    entry_key: string;
    moderated: boolean;
    display_name: string;
    login: string;
  }[];
}

/**
 * Topic: `onsite-notifications.<userId>` (`OAUTH`)
 *
 * Other notification event types: `"delete-notification"`,
 * `"read-notifications"`, `"read-all-notifications"`, `"update-notification"`.
 */
export type OnSiteNotificationEvent =
  CreateNotificationEvent | UpdateSummaryEvent;

export interface CreateNotificationEvent {
  type: "create-notification";
  data: {
    notification: {
      user_id: string;
      id: string;
      body: string;
      body_md: string;
      type: string;
      render_style: "DEFAULT" | (string & {});
      thumbnail_url: string;
      actions: {
        id: string;
        type: "click" | "modal" | (string & {});
        url: string;
        modal_id: string;
        body: string;
        label: "CTA" | (string & {});
      }[];
      created_at: string;
      updated_at: string;
      read: boolean;
      display_type: "VIEWER" | (string & {});
      category: "live" | (string & {});
      is_mobile_only: boolean;
      mobile_destination_type: "ChannelPage" | (string & {});
      mobile_destination_key: string;
    };
    persistent: boolean;
    toast: boolean;
    display_type: "VIEWER" | (string & {});
  };
}

export interface UpdateSummaryEvent {
  type: "update-summary";
  data: {
    summary: {
      unseen_view_count: number;
      last_seen_at: string;
      viewer_unread_count: number;
      creator_unread_count: number;
      safety_unread_count: number;
      summaries_by_display_type: Record<
        "CREATOR" | "SAFETY" | "VIEWER",
        {
          unread_summary: {
            count: number;
            last_read_all: string;
            count_by_md: Record<string, number>;
          };
          unseen_summary: {
            count: number;
            last_seen: string;
            count_by_md: Record<string, number>;
          };
        }
      >;
    };
  };
}

/** @deprecated Use `OnSiteNotificationEvent` instead. */
export type OnSiteNotifictaionEvent = OnSiteNotificationEvent;
/** @deprecated Use `CreateNotificationEvent` instead. */
export type CreateNotifictaionEvent = CreateNotificationEvent;

/**
 * Topic: `pinned-chat-updates-v1.<channelId>` (`NONE`)
 *
 * Also emits `"update-message"`.
 */
export type PinChatUpdatesEvent = PinMessageEvent | UnpinMessageEvent;

export interface PinMessageEvent {
  type: "pin-message";
  data: {
    id: string;
    pinned_by: {
      id: string;
      display_name: string;
    };
    message: {
      id: string;
      sender: {
        id: string;
        display_name: string;
        chat_color: string;
      };
      content: {
        text: string;
        fragments: {
          text: string;
          user_mention?: {
            userID: string;
            login: string;
            display_name: string;
          };
        }[];
      };
      type: string;
      starts_at: number;
      updated_at: number;
      ends_at: number;
      sent_at: number;
    };
    parent_message: {
      id: string;
      sender: {
        id: string;
        display_name: string;
        badges: {
          id: string;
          version: string;
        }[];
      };
      content: {
        text: string;
        fragments: {
          text: string;
          user_mention?: {
            userID: string;
            login: string;
            display_name: string;
          };
        }[];
      };
    };
    thread_parent_message: {
      id: string;
      sender: {
        id: string;
        display_name: string;
      };
      content: {
        text: string;
        fragments: {
          text: string;
          user_mention?: {
            userID: string;
            login: string;
            display_name: string;
          };
        }[];
      };
    };
  };
}

export interface UnpinMessageEvent {
  type: "unpin-message";
  data: {
    id: string;
    unpinned_by: {
      id: string;
      display_name: string;
    };
    reason: "UNPIN" | (string & {});
  };
}

/** Topic: `polls.<channelId>` (`NONE`) */
export interface PollEvent {
  type:
    | "POLL_CREATE"
    | "POLL_UPDATE"
    | "POLL_COMPLETE"
    | "POLL_ARCHIVE"
    | "POLL_TERMINATE"
    | "POLL_MODERATE";
  data: {
    poll: {
      poll_id: string;
      owned_by: string;
      created_by: string;
      title: string;
      /** ISO 8601 timestamp. */
      started_at: string;
      /** ISO 8601 timestamp or null while active. */
      ended_at: string | null;
      ended_by: string | null;
      duration_seconds: number;
      settings: {
        multi_choice: {
          is_enabled: boolean;
        };
        bits_votes: {
          is_enabled: boolean;
          cost: number;
        };
        channel_points_votes: {
          is_enabled: boolean;
          cost: number;
        };
      };
      status:
        | "ACTIVE"
        | "COMPLETED"
        | "TERMINATED"
        | "ARCHIVED"
        | "MODERATED"
        | "INVALID";
      choices: {
        choice_id: string;
        title: string;
        votes: {
          total: number;
          bits: number;
          channel_points: number;
          base: number;
        };
        tokens: {
          bits: number;
          channel_points: number;
        };
        total_voters: number;
      }[];
      votes: {
        total: number;
        bits: number;
        channel_points: number;
        base: number;
      };
      tokens: {
        bits: number;
        channel_points: number;
      };
      total_voters: number;
      remaining_duration_milliseconds: number;
      top_contributor: null | unknown;
      top_bits_contributor: null | unknown;
      top_channel_points_contributor: null | unknown;
    };
  };
}

/**
 * Topic: `predictions-channel-v1.<channelId>` (`NONE`)
 *
 * Note: `predictions-user-v1.<userId>` (`OAUTH`) also emits
 * `"prediction-made"`, `"prediction-updated"`, and `"prediction-result"`.
 */
export interface PredictionEvent {
  type: "event-created" | "event-updated";
  data: {
    timestamp: string;
    event: {
      id: string;
      channel_id: string;
      created_at: string;
      created_by: {
        type: "USER";
        user_id: string;
        user_display_name: string;
        extension_client_id: string | null;
      };
      ended_at: string | null;
      ended_by: {
        type: "USER";
        user_id: string;
        user_display_name: string;
        extension_client_id: string | null;
      } | null;
      locked_at: string | null;
      locked_by: {
        type: "USER";
        user_id: string;
        user_display_name: string;
        extension_client_id: string | null;
      } | null;
      outcomes: {
        id: string;
        color: "BLUE" | "PINK";
        title: string;
        total_points: number;
        total_users: number;
        top_predictors: {
          id: string;
          event_id: string;
          outcome_id: string;
          channel_id: string;
          points: number;
          predicted_at: string;
          updated_at: string;
          user_id: string;
          result: {
            type: "WIN" | "LOSE";
            points_won: number | null;
            is_acknowledged: boolean;
          } | null;
          user_display_name: string;
        }[];
        badge: {
          version: string;
          set_id: "predictions";
        };
      }[];
      prediction_window_seconds: number;
      status:
        | "ACTIVE"
        | "LOCKED"
        | "RESOLVE_PENDING"
        | "RESOLVED"
        | "CANCEL_PENDING"
        | "CANCELED";
      title: string;
      winning_outcome_id: string | null;
    };
  };
}

/** Topic: `private-callout.<userId>` or `private-callout.<userId>.<channelId>` (`OAUTH`) */
export type PrivateCalloutEvent = SendPrivateCalloutEvent;

export interface SendPrivateCalloutEvent {
  type: "send-private-callout";
  data: {
    private_callout: {
      id: string;
      thumbnail_url: string;
      type: string;
      body: string;
      render_style: "PRIVATE_CALLOUT_ONE_BUTTON" | (string & {});
      actions: {
        id: string;
        type: "modal" | "click" | (string & {});
        modal_id: string;
        body: string;
        url: string;
        post_action_content: string;
        chat_input_tray_title: string;
        chat_input_tray_body: string;
      }[];
    };
  };
}

/**
 * Topic: `raid.<channelId>` (`NONE`)
 *
 * Other raid event types: `"raid_cancel_v2"`, `"raid_update"`, `"raid_cancel"`.
 */
export interface RaidDetails {
  id: string;
  creator_id: string;
  source_id: string;
  source_login: string;
  source_display_name: string;
  source_profile_image: string;
  source_stream_category: string;
  target_id: string;
  target_login: string;
  target_display_name: string;
  target_profile_image: string;
  target_stream_name: string;
  target_viewer_count: string;
  target_stream_category: string;
  target_stream_thumbnail: string;
  transition_jitter_seconds: number;
  force_raid_now_seconds: number;
  viewer_count: number;
  raid_created_at: number;
}

export interface RaidUpdateV2Event {
  type: "raid_update_v2";
  raid: RaidDetails;
}

export interface RaidGoV2Event {
  type: "raid_go_v2";
  raid: RaidDetails;
}

/** Topic: `shoutout.<channelId>` (`NONE`) */
export interface ShoutoutEvent {
  type: "create";
  data: {
    broadcasterUserID: string;
    targetUserID: string;
    targetLogin: string;
    targetUserProfileImageURL: string;
    sourceUserID: string;
    sourceLogin: string;
    shoutoutID: string;
    targetUserDisplayName: string;
    targetUserCTAInfo: string;
    targetUserPrimaryColorHex: string;
  };
}

/**
 * Topic: `stream-chat-room-v1.<channelId>` (`NONE`)
 *
 * Other event types: `"updated_channel_chat_property"`.
 */
export type StreamChatRoomEvent = ChatRichEmbedEvent | UpdatedRoomEvent;

export interface ChatRichEmbedEvent {
  type: "chat_rich_embed";
  data: {
    message_id: string;
    request_url: string;
    author_name: string;
    thumbnail_url: string;
    title: string;
    twitch_metadata: {
      clip_metadata?: {
        game: string;
        channel_display_name: string;
        slug: string;
        id: string;
        broadcaster_id: string;
        curator_id: string;
        assets: {
          thumbnail_url: string;
          aspect_ratio: number;
          type: "SOURCE" | "PORTRAIT" | (string & {});
        }[];
      };
    };
  };
}

export interface UpdatedRoomEvent {
  type: "updated_room";
  data: {
    room: {
      channel_id: string;
      modes: {
        followers_only_duration_minutes: number | null;
        emote_only_mode_enabled: boolean;
        r9k_mode_enabled: boolean;
        subscribers_only_mode_enabled: boolean;
        verified_only_mode_enabled: boolean;
        slow_mode_duration_seconds: number | null;
        slow_mode_set_at: string;
        chat_delay_duration_seconds: number;
        account_verification_options: {
          subscribers_exempt: boolean;
          moderators_exempt: boolean;
          vips_exempt: boolean;
          phone_verification_mode: number;
          email_verification_mode: number;
          partial_phone_verification_config: {
            restrict_first_time_chatters: boolean;
            restrict_based_on_follower_age: boolean;
            restrict_based_on_account_age: boolean;
            minimum_follower_age_in_minutes: number;
            minimum_account_age_in_minutes: number;
          };
          partial_email_verification_config: {
            restrict_first_time_chatters: boolean;
            restrict_based_on_follower_age: boolean;
            restrict_based_on_account_age: boolean;
            minimum_follower_age_in_minutes: number;
            minimum_account_age_in_minutes: number;
          };
        };
        restrict_first_time_chatters_enabled: boolean;
        restrict_chat_based_on_account_age: boolean;
        restrict_chat_based_on_account_age_in_minutes: number;
      };
      rules: string[];
    };
  };
}

/**
 * Topic: `user-drop-events.<userId>` (`OAUTH`)
 *
 * Other drop event types: `"drop-claim"`, `"drop-event"`, `"chest-roll-granted"`.
 */
export type UserDropEvent = DropProgressEvent;

export interface DropProgressEvent {
  type: "drop-progress";
  data: {
    drop_id: string;
    channel_id: string;
    current_progress_min: number;
    required_progress_min: number;
    current_progress: number;
    required_progress: number;
    progress_type: "minutes_watched" | (string & {});
    is_sitewide: boolean;
  };
}

/**
 * Topic: `video-playback-by-id.<channelId>` (`NONE`)
 *
 * Also emits `"stream-up"` and `"stream-down"`.
 */
export type VideoPlaybackByIdEvent = ViewcountEvent | CommercialEvent;

export interface ViewcountEvent {
  type: "viewcount";
  server_time: number;
  viewers: number;
  collaboration_status: string;
  collaboration_viewers: number;
  costream_status: string;
  costream_viewers: number;
}

export interface CommercialEvent {
  type: "commercial";
  server_time: number;
  length: number;
  scheduled: boolean;
}

/** Topic: `viewer-milestones.<userId>` or `viewer-milestones.<userId>.<channelId>` (`OAUTH`) */
export type ViewerMilestonesEvent =
  StreakRecoveredEvent | ViewerMilestonesUpdateEvent | WatchStreakEvent;

export interface StreakRecoveredEvent {
  type: "streak-recovered";
  data: {
    channel_id: string;
    watch_streak_value: number;
    missed_streams: {
      channel_id: string;
      viewer_id: string;
      broadcast_ids: string[];
      start_time: string;
      end_time: string;
      grace_period_end: string;
      status: "RECOVERED" | (string & {});
      created_at: string;
      updated_at: string;
    }[];
  };
}

export interface ViewerMilestonesUpdateEvent {
  type: "viewer-milestones-update";
  data: {
    channel_id: string;
    watch_streak_value: string;
    watch_streak_threshold: number;
    event_type: "achieved" | (string & {});
  };
}

export interface WatchStreakEvent {
  type: "watch-streak";
  data: {
    watch_streak_value: string;
    share_status: "CAN_SHARE" | "CAN_NOT_SHARE" | (string & {});
    milestone_id: string;
    watch_streak_threshold: number;
    watch_streak_reset: boolean;
    watch_streak_reward: number;
  };
}

export type KnownPubSubEvent =
  | AdsEvent
  | BroadcastSettingsUpdateEvent
  | CelebrationEvent
  | ChannelSubGiftsEvent
  | CommunityPointsChannelEvent
  | CommunityPointsUserEvent
  | ContentClassificationLabelsEvent
  | CreatorGoalsEvent
  | HypeTrainEvent
  | LeaderboardEvent
  | OnSiteNotificationEvent
  | PinChatUpdatesEvent
  | PollEvent
  | PredictionEvent
  | PrivateCalloutEvent
  | RaidUpdateV2Event
  | RaidGoV2Event
  | ShoutoutEvent
  | StreamChatRoomEvent
  | UserDropEvent
  | VideoPlaybackByIdEvent
  | ViewerMilestonesEvent;

// ============================================================================
// Known PubSub Topics (with Auth Requirements & Key Formats)
// ============================================================================

/**
 * Topic authorization modes defined in Twitch Web client:
 * - `NONE` — public topic, no OAuth token required
 * - `OAUTH` — requires user OAuth token
 * - `EXTENSION_JWT` — requires Twitch Extension JWT
 */
export type HermesTopicAuth = "NONE" | "OAUTH" | "EXTENSION_JWT";

/**
 * User / broadcaster / moderator topics requiring `OAUTH` authentication.
 * Comments show auth requirement and subscription suffix format where used in Twitch Web.
 */
export type KnownUserTopics = [
  "activity-feed-broadcaster-v2", // OAUTH | `<id>.<id>`
  "ads-manager", // OAUTH | `<id1>.<id2>`
  "automod-levels-modification", // OAUTH | `<id1>.<id2>`
  "automod-queue", // OAUTH | `<id1>.<id2>`
  "badge_update", // OAUTH (not in Web client)
  "bits-ext-v1-user-transaction", // OAUTH | `<userId>.<channelId>-<extensionId>`
  "challenge-condition-participants", // OAUTH (not in Web client)
  "channel-bits-badge-unlocks", // OAUTH (not in Web client)
  "channel-bits-events-v1", // OAUTH
  "channel-bits-events-v2", // OAUTH (not in Web client)
  "channel-chat-highlights", // OAUTH | `<id1>.<id2>`
  "channel-points-channel-v1", // OAUTH (not in Web client; Web uses community-points-channel-v1)
  "channel-subscribe-events-v1", // OAUTH
  "channel-unban-requests", // OAUTH | `<id1>.<id2>`
  "chat_moderator_actions", // OAUTH | `<userId>.<channelId>`
  "chatrooms-user-v1", // OAUTH | `<userId>`
  "collaboration-status-user-update", // OAUTH | `<id1>.<id2>`
  "collaboration-user-v1", // OAUTH | `<userId>`
  "community-moments-user-v1", // OAUTH
  "community-points-broadcaster-v1", // OAUTH
  "community-points-user-v1", // OAUTH | `<userId>`
  "creator-coach-reminders", // OAUTH | `<userId>`
  "creator-messages-available", // OAUTH | `<userId>`
  "dashboard-alert-status", // OAUTH
  "dashboard-multiplayer-ads-events", // OAUTH (not in Web client)
  "emote-animations", // OAUTH | `<userId>`
  "emote-uploads", // OAUTH | `<userId>`
  "feature-consequence-user", // OAUTH | `<userId>`
  "follows", // OAUTH | `<userId>`
  "friendship", // OAUTH (not in Web client)
  "gift-amount-fulfilled-events-v1", // OAUTH | `<id1>.<id2>`
  "guest-star-user-v1", // OAUTH | `<userId>`
  "host-train-ballot-v1", // OAUTH | `<userId>`
  "invite-links-broadcaster-v1", // OAUTH | `<id>`
  "low-trust-users", // OAUTH | `<id1>.<id2>`
  "moderator-actions", // OAUTH | `<id1>.<id2>`
  "onsite-notifications", // OAUTH | `<userId>`
  "payout-onboarding-events", // OAUTH | `<userId>`
  "payout-status-events", // OAUTH | `<userId>`
  "predictions-user-v1", // OAUTH | `<userId>`
  "presence", // OAUTH (not in Web client)
  "prime-gaming-offer", // OAUTH | `<userId>`
  "private-callout", // OAUTH | `<userId>` or `<userId>.<channelId>`
  "pubsubtest-with-oauth", // OAUTH (not in Web client)
  "purchase-fulfillment-events", // OAUTH
  "qna-user-v1", // OAUTH (not in Web client)
  "reportable-moderation-target", // OAUTH
  "rocket-boost-user-v1", // OAUTH (not in Web client)
  "shared-chat-broadcaster-v1", // OAUTH
  "shield-mode", // OAUTH
  "story-publish", // OAUTH (not in Web client)
  "stream-change-v1", // OAUTH
  "subs-events-v1", // OAUTH | `<channelId>`
  "subscribers-csv-v1", // OAUTH | `<channelId>`
  "support-chat", // OAUTH (not in Web client)
  "user-bits-updates-v1", // OAUTH | `<userId>`
  "user-campaign-events", // OAUTH
  "user-commerce-events", // OAUTH
  "user-costream-status", // OAUTH | `<id1>.<id2>`
  "user-crate-events-v1", // OAUTH
  "user-creator-campaign-events", // OAUTH | `<userId>`
  "user-drop-events", // OAUTH | `<userId>`
  "user-emote-chest-events", // OAUTH | `<userId>`
  "user-emote-entitlements-v1", // OAUTH | `<userId>`
  "user-extensionpurchase-events", // OAUTH (not in Web client)
  "user-gift-badge-events-v1", // OAUTH
  "user-moderation-notifications", // OAUTH | `<id1>.<id2>`
  "user-preferences-update-v1", // OAUTH | `<userId>`
  "user-promotion-activation", // OAUTH | `<userId>`
  "user-properties-update", // OAUTH | `<userId>`
  "user-subscribe-events-v1", // OAUTH | `<userId>`
  "user-unban-requests", // OAUTH | `<id1>.<id2>`
  "video-thumbnail-processing", // OAUTH | `<videoId>`
  "viewer-milestones", // OAUTH | `<userId>` or `<userId>.<channelId>`
  "weekly-rewards", // OAUTH | `<id1>.<id2>`
  "whispers", // OAUTH | `<userId>`
];

/**
 * Unauthenticated / public topics (`NONE` auth).
 * Comments show auth requirement and subscription suffix format where used in Twitch Web.
 */
export type KnownDeviceTopics = [
  "activity-feed-alerts-v2", // NONE | `<channelId>`
  "activity-feed-moderator-v2", // NONE | `<channelId>`
  "ad-property-refresh", // NONE | `<channelId>`
  "ad-stitching", // NONE (not in Web client)
  "ads", // NONE | `<channelId>`
  "alert-settings-update", // NONE | `<channelId>`
  "bits-campaigns-v1", // NONE | `updates` (`bits-campaigns-v1.updates`)
  "bits-ext-v1-transaction", // NONE (not in Web client)
  "bits-pinata-channel-v1", // NONE (not in Web client)
  "bits-rewards-celebration-v1", // NONE | `<channelId>`
  "broadcast-settings-update", // NONE | `<channelId>`
  "campaign-events", // NONE
  "celebration-events-v1", // NONE | `<channelId>`
  "challenge-conditions", // NONE (not in Web client)
  "challenges", // NONE (not in Web client)
  "channel", // NONE (not in Web client)
  "channel-ad-poll-update-events", // NONE (not in Web client)
  "channel-bit-events-public", // NONE | `<channelId>`
  "channel-bits-onetap-events", // NONE (not in Web client)
  "channel-bounty-board-events", // NONE (not in Web client)
  "channel-cheer-events-public-v1", // NONE (not in Web client)
  "channel-drop-events", // NONE
  "channel-emote-updates", // NONE (not in Web client)
  "channel-event-updates", // NONE
  "channel-prime-gifting-status", // NONE
  "channel-squad-invites", // NONE (not in Web client)
  "channel-squad-updates", // NONE (not in Web client)
  "channel-sub-gifts-v1", // NONE | `<channelId>`
  "charity-campaign-donation-events-v1", // NONE | `<channelId>`
  "chat-v1", // NONE (not in Web client)
  "chat_message_updated", // NONE (not in Web client)
  "chatrooms-channel-v1", // NONE (not in Web client)
  "clock-experiment-v1", // NONE (not in Web client)
  "collaboration-channel-v1", // NONE | `<channelId>`
  "collaboration-status-channel-refetch", // NONE | `<channelId>`
  "community-boost-events-v1", // NONE | `<channelId>`
  "community-intros-channel", // NONE (not in Web client)
  "community-moments-channel-v1", // NONE | `<channelId>`
  "community-points-channel-v1", // NONE | `<channelId>`
  "content-classification-labels-v1", // NONE | `<channelId>`
  "content-policy-properties", // NONE | `<channelId>`
  "creative-community", // NONE (not in Web client)
  "creator-goals-events-v1", // NONE | `<channelId>`
  "crowd-chant-channel-v1", // NONE (not in Web client)
  "dashboard-activity-feed", // NONE
  "emote-tally-v1", // NONE (not in Web client)
  "extension-control", // NONE | `<channelId>` (also `extension-control.upload`)
  "extension-control.upload", // NONE | `<extensionId>`
  "feature-consequence-channel", // NONE | `<channelId>`
  "feeds", // NONE (not in Web client)
  "following", // NONE (not in Web client)
  "gamelift-proxy", // NONE (not in Web client)
  "guest-star-channel-v1", // NONE | `<channelId>`
  "hermes_pubsub_testing", // NONE (not in Web client)
  "host-train", // NONE | `<channelId>`
  "leaderboard-events-v1", // NONE | `clips-<channelId>`, `sub-gifts-sent-<channelId>-<unit>`, `bits-usage-by-channel-v1-<channelId>-<unit>`
  "live-shopping-updates", // NONE | `<channelId>`
  "multiview-chanlet-update", // NONE
  "pinned-chat-updates-v1", // NONE | `<channelId>`
  "plusprogram-points-v1", // NONE | `<channelId>`
  "polls", // NONE | `<channelId>`
  "predictions-channel-v1", // NONE | `<channelId>`
  "predictions-moderator-v1", // NONE | `<channelId>`
  "pubsubtest", // NONE (not in Web client)
  "pv-watch-party-events", // NONE (not in Web client)
  "qna-channel-v1", // NONE (not in Web client)
  "radio-events-v1", // NONE (not in Web client)
  "raid", // NONE | `<channelId>`
  "raid-target", // NONE | `<channelId>`
  "request-to-join-channel-v1", // NONE | `<channelId>`
  "request-to-join-moderator-v1", // NONE | `<channelId>`
  "rewind-updates-v1", // NONE | `<channelId>`
  "rocket-boost-channel-v1", // NONE | `<channelId>`
  "shared-chat-channel-v1", // NONE | `<channelId>`
  "shoutout", // NONE | `<channelId>`
  "sponsorships-v1", // NONE | `<channelId>` or `category.<categoryId>`
  "squad-updates", // NONE (not in Web client)
  "stream-change-by-channel", // NONE
  "stream-chat-room-v1", // NONE | `<channelId>`
  "stream-layout-update", // NONE (not in Web client)
  "subathon-contribution-settings-updates-v1", // NONE (not in Web client)
  "subathon-updates-v1", // NONE (not in Web client)
  "upload", // NONE | `<id>`
  "upload-v2", // NONE | `<id>`
  "user-image-update", // NONE | `<userId>`
  "video-playback", // NONE
  "video-playback-by-id", // NONE | `<channelId>`
];

/**
 * Legacy channel-grouped topics from earlier client definitions.
 * Note: `"user-gift-badge-events-v1"` requires `OAUTH` and is also listed in `KnownUserTopics`.
 */
export type KnownChannelTopics = [
  "hype-train-events-v1", // NONE
  "hype-train-events-v1.rewards", // NONE | `<id>`
  "hype-train-events-v2", // NONE | `<channelId>`
  "user-gift-badge-events-v1", // OAUTH (also in KnownUserTopics)
];

/**
 * Twitch Extension JWT topics.
 */
export type KnownExtensionTopics = [
  "channel-ext-v1", // EXTENSION_JWT (not in Web client)
];

export type KnownTopic =
  | KnownUserTopics[number]
  | KnownDeviceTopics[number]
  | KnownChannelTopics[number]
  | KnownExtensionTopics[number];

// ============================================================================
// Known PubSub Inner Event `type` Discriminators
// ============================================================================

/**
 * Rewind video update statuses (`rewind-updates-v1`).
 */
export type KnownRewindUpdateType =
  | "REWIND_UPDATE_VIDEO_AVAILABLE"
  | "REWIND_UPDATE_VIDEO_PRIVATE"
  | "REWIND_UPDATE_VIDEO_DELETED";

/**
 * Complete union of known inner `type` values emitted across Twitch PubSub events.
 */
export type KnownPubSubEventType =
  // Activity Feed & Alerts
  | "activity_feed_alerts_create"
  | "activity_feed_alerts_update"
  | "activity_feed_event_create"
  | "alert_sets_alert_set_update"
  | "alert_sets_alert_settings_update"
  | "alert_sets_alert_variation_delete"
  | "alert_sets_alert_variation_update"
  | "alert_sets_celebration"
  | "dashboard-alert-status"
  // Ads
  | "ads-schedule-update"
  | "commercial"
  | "midroll_request"
  // AutoMod, Moderation, Shield Mode & Unban Requests
  | "ACKNOWLEDGED_AUTOBANS"
  | "ADD_AUTOBAN_TERM"
  | "ADD_AUTOBAN_USER"
  | "DELETE_AUTOBAN_TERM"
  | "UPDATE_CHANNEL_MODERATION_MODE"
  | "UPDATE_CHANNEL_MODERATION_MODE_SHORTCUT"
  | "UPDATE_CHANNEL_MODERATION_SETTINGS"
  | "approve_unban_request"
  | "automod_caught_message"
  | "automod_levels_modified"
  | "ban_evasion_detection_settings_update"
  | "channel-flc-update"
  | "channel_banned_alias_restriction_update"
  | "channel_terms_action"
  | "create_unban_request"
  | "deny_unban_request"
  | "last-x-experiment-moderation"
  | "low_trust_user_new_message"
  | "low_trust_user_treatment_update"
  | "mod-recap"
  | "moderation_action"
  | "moderator-action-v2"
  | "moderator_added"
  | "moderator_removed"
  | "purge_messages_request"
  | "reportable_target_create"
  | "reported_status_update"
  | "update_unban_request"
  | "user-flc-update"
  | "user_moderation_action"
  | "vip_added"
  | "vip_removed"
  // Bits, Cheermotes, Celebrations & Leaderboards
  | "automatic-reward-celebration"
  | "badge_update"
  | "badge_update_notification"
  | "balance_update"
  | "bits-badge-tier-emote-create"
  | "bits-leaderboard-event"
  | "bits-pin-event"
  | "celebrations_message"
  | "channel_settings_update"
  | "cheerbomb"
  | "clips-leaderboard-update"
  | "first_bits_purchase"
  | "sponsored-cheermote-add"
  | "sponsored-cheermote-campaign-complete"
  | "sponsored-cheermote-remove"
  | "sponsored-cheermote-update-used"
  // Broadcast, Stream, Playback & Rewind
  | "broadcast_settings_update"
  | "chanlet"
  | "channel-ccls-updated"
  | "metadata_change"
  | "processing_complete"
  | "processing_error"
  | "properties-v1"
  | "refetch_video_token"
  | "rewind-updates-v1"
  | "stream-down"
  | "stream-up"
  | "stream_down"
  | "stream_up"
  | "viewcount"
  | "watchparty-vod"
  // Channel Points, Predictions, Polls & Creator Goals
  | "POLL_ARCHIVE"
  | "POLL_COMPLETE"
  | "POLL_CREATE"
  | "POLL_MODERATE"
  | "POLL_TERMINATE"
  | "POLL_UPDATE"
  | "active-multipliers-updated"
  | "automatic-reward-redeemed"
  | "automatic-reward-updated"
  | "channel-last-viewed-content-updated"
  | "channel-settings-update"
  | "claim-available"
  | "claim-claimed"
  | "community-goal-contribution"
  | "community-goal-created"
  | "community-goal-deleted"
  | "community-goal-updated"
  | "custom-reward-created"
  | "custom-reward-deleted"
  | "custom-reward-updated"
  | "event-created"
  | "event-updated"
  | "global-last-viewed-content-updated"
  | "goal_achieved"
  | "goal_created"
  | "goal_finished"
  | "goal_updated"
  | "points-earned"
  | "points-spent"
  | "prediction-made"
  | "prediction-result"
  | "prediction-updated"
  | "redemption-status-update"
  | "reward-redeemed"
  | "update-redemption-statuses-finished"
  | "update-redemption-statuses-progress"
  // Chat, Pinned Chat, Shared Chat, Support Chat & Whispers
  | "chat-highlight"
  | "chat-notification"
  | "chat_rich_embed"
  | "error"
  | "extension_message"
  | "host_target_change"
  | "host_target_change_v2"
  | "pin-message"
  | "response"
  | "send-private-callout"
  | "session-created"
  | "session-ended"
  | "session-started"
  | "session-updated"
  | "thread"
  | "threads"
  | "unpin-message"
  | "update-message"
  | "updated_channel_chat_property"
  | "updated_room"
  | "whisper_deleted"
  | "whisper_edited"
  | "whisper_received"
  | "whisper_sent"
  // Collaboration, Guest Star & Request to Join
  | "call-ended"
  | "call-started"
  | "collaboration-status-available"
  | "collaboration-status-none"
  | "collaboration-status-refetch"
  | "collaboration-status-unavailable"
  | "collaborator-updated"
  | "collaborator-user-update"
  | "costream-role-update"
  | "drop-in-host-update"
  | "drop-in-user-update"
  | "favorite-channel-update"
  | "favorite-host-update"
  | "group-created"
  | "group-disbanded"
  | "group-updated"
  | "group-user-removed"
  | "guest-preferences-changed"
  | "host-settings-changed"
  | "invite-changed"
  | "join-request-approver-update"
  | "join-request-user-update"
  | "moderator-role-changed"
  | "request-to-join-queue-cleared"
  | "request-to-join-queue-closed"
  | "request-to-join-queue-update"
  | "request-to-join-streamer-update"
  | "request-to-join-viewer-update"
  | "session-role-changed"
  | "session-settings-changed"
  | "slot-assignments-changed"
  | "slot-publisher-joined"
  | "slot-settings-changed"
  | "slot-subscriber-joined"
  | "slot-subscribers-deleted"
  // Hype Train, Host Train, Community Boost, Moments & Rocket Boost
  | "active"
  | "boost-opportunity-completion"
  | "boost-opportunity-start"
  | "claimed"
  | "community-boost-end"
  | "community-boost-progression"
  | "community-boost-start"
  | "host_train_ballot"
  | "host_train_update"
  | "hype-train-approaching"
  | "hype-train-conductor-update"
  | "hype-train-cooldown-expiration"
  | "hype-train-end"
  | "hype-train-level-up"
  | "hype-train-progression"
  | "hype-train-reward-eligibility"
  | "hype-train-rewards"
  | "hype-train-shared-channel-left"
  | "hype-train-shared-conversion"
  | "hype-train-shared-merge-trains"
  | "hype-train-start"
  // Raids & Shoutouts
  | "create"
  | "raid_cancel"
  | "raid_cancel_v2"
  | "raid_go_v2"
  | "raid_update"
  | "raid_update_v2"
  // Drops, Campaigns, Prime, Crates & Rewards
  | "chest-roll-granted"
  | "claim-failed"
  | "claim-success"
  | "crate-event"
  | "drop-claim"
  | "drop-event"
  | "drop-progress"
  | "plus_points_update"
  | "prime-gifting"
  | "progress"
  | "reward"
  | "weekly-rewards"
  // Subscriptions, Gifting, Badges, Emotes, Milestones & Follows
  | "SubTokenBalanceUpdate"
  | "chest-granted"
  | "emote-animations"
  | "gift-amount-fulfilled"
  | "gift-event"
  | "mystery-gift-purchase"
  | "scarcity-badge-granted"
  | "scarcity-badge-revoked"
  | "streak-recovered"
  | "subscribers_csv_complete_v1"
  | "subscribers_csv_in_progress_v1"
  | "user-emote-entitlements"
  | "user-followed"
  | "user-gifter-badge-event-badge-restored"
  | "user-unfollowed"
  | "viewer-milestones-update"
  | "watch-streak"
  // Onsite Notifications, Preferences, Coach & Creator Messages
  | "UNREAD"
  | "chat-ui-settings:accessibility:celebrations-enabled"
  | "chat-ui-settings:accessibility:emote-animations-enabled"
  | "chat-ui-settings:accessibility:gif-animations-enabled"
  | "chat-ui-settings:accessibility:gifs-enabled"
  | "chat-ui-settings:accessibility:readable-chat-colors-enabled"
  | "create-notification"
  | "creator_coach_cross_post_reminder"
  | "creator_coach_reminders"
  | "delete-notification"
  | "read-all-notifications"
  | "read-notifications"
  | "update-notification"
  | "update-summary"
  | "user-promotion-activation"
  | "user_properties_update"
  // Payouts, Commerce, Sponsorships, Charity, Uploads & Misc
  | "account_limit_event"
  | "address_match_update"
  | "campaign-instance-refresh"
  | "campaign-instance-update"
  | "charity_campaign_donation"
  | "charity_campaign_status"
  | "extension-control-upload"
  | "idv_status_update"
  | "imageuploadsuccess"
  | "invite-link-generated"
  | "last-x-experiment-event"
  | "live-shopping-updates"
  | "payability_achieved"
  | "payability_processing_complete"
  | "payout-onboarding-event"
  | "payout_status_update"
  | "pixel_tracking_update"
  | "purchase_fulfillment_events"
  | "upload"
  | "upload-v2";
