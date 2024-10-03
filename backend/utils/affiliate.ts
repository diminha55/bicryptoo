import { models } from "@b/db";
import { notifyUsersWithPermission, saveNotification } from "./notifications";
import { settings } from "../..";

export async function processRewards(
  userId: string,
  amount: number,
  conditionName: string,
  currency: string
) {
  const mlmSystem = settings.has("mlmSystem")
    ? settings.get("mlmSystem")
    : "DIRECT";

  let mlmSettings = null;
  try {
    mlmSettings = settings.has("mlmSettings")
      ? JSON.parse(settings.get("mlmSettings"))
      : null;
  } catch (error) {
    console.error("Failed to parse MLM settings:", error);
  }

  if (!mlmSettings) {
    console.error("MLM settings not found");
    return; // MLM settings not found
  }

  // Validate transaction type and currency
  if (!isValidTransaction(conditionName, amount, currency)) {
    console.error("Invalid transaction type or currency");
    return;
  }

  const { mlmReferralCondition } = models;

  const condition = await mlmReferralCondition.findOne({
    where: { name: conditionName, status: true },
  });

  if (!condition) {
    console.error("Invalid referral condition");
    return;
  }

  let rewardsProcessed = false; // Flag to indicate if rewards were successfully processed

  switch (mlmSystem) {
    case "DIRECT":
      rewardsProcessed = await processDirectRewards(condition, userId, amount);
      break;
    case "BINARY":
      rewardsProcessed = await processBinaryRewards(
        condition,
        userId,
        amount,
        mlmSettings
      );
      break;
    case "UNILEVEL":
      rewardsProcessed = await processUnilevelRewards(
        condition,
        userId,
        amount,
        mlmSettings
      );
      break;
    default:
      console.error("Invalid MLM system type");
      break;
  }

  if (rewardsProcessed) {
    // Notify the user about their reward
    await saveNotification(
      userId, // Assuming userId is a string and needs to be converted to a number. Adjust as needed.
      "Reward Processed",
      `Your reward for ${conditionName} of ${amount} ${currency} has been successfully processed.`,
      NotificationType.SYSTEM
    );

    // Notify users with the "View MLM Rewards" permission about the reward process
    await notifyUsersWithPermission(
      "View MLM Rewards",
      "MLM Reward Processed",
      `A reward for ${conditionName} of ${amount} ${currency} was processed for user ${userId}.`,
      NotificationType.SYSTEM
    );
  }
}

function isValidTransaction(conditionName, amount, currency) {
  switch (conditionName) {
    case "WELCOME_BONUS":
      return currency === "USDT" && amount >= 100;
    case "MONTHLY_TRADE_VOLUME":
      return currency === "USDT" && amount > 1000;
    case "TRADE_COMMISSION":
    case "INVESTMENT":
    case "AI_INVESTMENT":
    case "FOREX_INVESTMENT":
    case "ICO_CONTRIBUTION":
    case "STAKING_LOYALTY":
    case "ECOMMERCE_PURCHASE":
    case "P2P_TRADE":
      return true;
    default:
      return false;
  }
}

async function processDirectRewards(condition, referredId, amount) {
  // Find the referral record
  const referral = await models.mlmReferral.findOne({
    where: { referredId },
  });

  if (!referral) return false;

  // Check for existing reward
  const count = await models.mlmReferralReward.count({
    where: {
      referrerId: referral.referrerId,
      conditionId: condition.id,
    },
  });

  if (count > 0) return false;

  // Calculate reward amount
  const rewardAmount =
    condition.rewardType === "PERCENTAGE"
      ? amount * (condition.reward / 100)
      : condition.reward;

  // Create the reward record
  await models.mlmReferralReward.create({
    referrerId: referral.referrerId,
    conditionId: condition.id,
    reward: rewardAmount,
  });

  return true;
}

// Helper function to find uplines
async function findUplines(userId, systemType, levels) {
  const uplines: { level: number; referrerId: any }[] = [];
  let currentUserId = userId;

  // Assume model names for binary and unilevel systems
  const model =
    systemType === "BINARY" ? models.mlmBinaryNode : models.mlmUnilevelNode;

  for (let i = 0; i < levels; i++) {
    const referral = await models.mlmReferral.findOne({
      where: { referredId: currentUserId },
      include: [
        {
          model: model,
          as: systemType === "BINARY" ? "node" : "unilevelNode",
          required: true,
        },
      ],
    });

    if (!referral || !referral.referrerId) {
      console.error(
        `User ${currentUserId} is not associated to ${
          systemType === "BINARY" ? "mlmBinaryNode" : "mlmUnilevelNode"
        }!`
      );
      break;
    }

    uplines.push({
      level: i + 1,
      referrerId: referral.referrerId,
    });

    currentUserId = referral.referrerId;
  }

  return uplines;
}

// Common function to create reward record
async function createRewardRecord(referrerId, rewardAmount, conditionId) {
  await models.mlmReferralReward.create({
    referrerId,
    reward: rewardAmount,
    conditionId: conditionId,
  });
}

// Binary Rewards Processing
async function processBinaryRewards(
  condition,
  userId,
  depositAmount,
  mlmSettings
) {
  const binaryLevels = mlmSettings.binary.levels;
  const uplines = await findUplines(userId, "BINARY", binaryLevels);

  if (!uplines.length) {
    return false;
  }

  // Distribute rewards starting from the closest upline
  for (let i = uplines.length - 1; i >= 0; i--) {
    const upline: { level: number; referrerId: any } = uplines[i];
    const levelIndex = binaryLevels - i; // Reverse the index for percentage lookup
    const levelRewardPercentage = mlmSettings.binary.levelsPercentage.find(
      (l) => l.level === levelIndex
    )?.value;

    if (levelRewardPercentage === undefined) {
      continue;
    }

    // Calculate base reward using the level's percentage
    const baseReward = depositAmount * (levelRewardPercentage / 100);

    // Then apply the condition's reward percentage to the base reward
    const finalReward = baseReward * (condition.reward / 100);

    await createRewardRecord(upline.referrerId, finalReward, condition.id);
  }

  return true;
}

// Unilevel Rewards Processing
async function processUnilevelRewards(
  condition,
  userId,
  depositAmount,
  mlmSettings
) {
  const unilevelLevels = mlmSettings.unilevel.levels;
  const uplines = await findUplines(userId, "UNILEVEL", unilevelLevels);

  if (!uplines.length) {
    return false;
  }

  // Distribute rewards starting from the closest upline
  for (let i = uplines.length - 1; i >= 0; i--) {
    const upline: { level: number; referrerId: any } = uplines[i];
    const levelIndex = unilevelLevels - i; // Reverse the index for percentage lookup
    const levelRewardPercentage = mlmSettings.unilevel.levelsPercentage.find(
      (l) => l.level === levelIndex
    )?.value;

    if (levelRewardPercentage === undefined) {
      continue;
    }

    // Calculate base reward using the level's percentage
    const baseReward = depositAmount * (levelRewardPercentage / 100);

    // Then apply the condition's reward percentage to the base reward
    const finalReward = baseReward * (condition.reward / 100);

    await createRewardRecord(upline.referrerId, finalReward, condition.id);
  }

  return true;
}

export const handleReferralRegister = async (refId, userId) => {
  const referrer = await models.user.findByPk(refId);

  if (referrer) {
    const referral = await models.mlmReferral.create({
      referrerId: referrer.id,
      referredId: userId,
      status: "PENDING",
    });

    const mlmSystem = settings.has("mlmSystem")
      ? settings.get("mlmSystem")
      : null;

    if (mlmSystem && mlmSystem.value === "BINARY") {
      await handleBinaryMlmReferralRegister(
        referral.referrerId,
        referral.id,
        models.mlmBinaryNode
      );
    } else if (mlmSystem && mlmSystem.value === "UNILEVEL") {
      await handleUnilevelMlmReferralRegister(
        referral.referrerId,
        referral.id,
        models.mlmUnilevelNode
      );
    }
  }
};

const handleBinaryMlmReferralRegister = async (
  referrerId,
  referralId,
  mlmBinaryNode
) => {
  const referrerNode = await mlmBinaryNode.findOne({
    where: { referralId: referrerId },
  });

  const placement = referrerNode && referrerNode.leftChildId ? "right" : "left";

  await mlmBinaryNode.create({
    referralId: referralId,
    parentId: referrerNode ? referrerNode.id : null,
    [`${placement}ChildId`]: referrerNode ? referrerNode.id : null,
  });
};

const handleUnilevelMlmReferralRegister = async (
  referrerId,
  referralId,
  mlmUnilevelNode
) => {
  const referrerUnilevelNode = await mlmUnilevelNode.findOne({
    where: { referralId: referrerId },
  });

  await mlmUnilevelNode.create({
    referralId: referralId,
    parentId: referrerUnilevelNode ? referrerUnilevelNode.id : null,
  });
};
