import { models } from "@b/db";
import { handleClientMessage } from "@b/handler/Websocket";
import { taskQueue } from "./task";

/**
 * Saves a notification to the database.
 *
 * @param {Object} notificationData - The notification data.
 * @param {string} notificationData.userId - The ID of the user to whom the notification is sent.
 * @param {string} notificationData.title - The title of the notification.
 * @param {string} notificationData.message - The message of the notification.
 * @param {string} notificationData.type - The type of the notification.
 * @param {string} [notificationData.link] - Optional link associated with the notification.
 * @returns {Promise<Object>} The saved notification.
 */
export async function saveNotification(
  userId: string,
  title: string,
  message: string,
  type: NotificationType,
  link?: string
): Promise<Notification> {
  try {
    return (await models.notification.create({
      userId: userId,
      type,
      title,
      message,
      link,
    })) as unknown as Notification;
  } catch (error) {
    console.error("Error saving notification:", error);
    throw error;
  }
}

/**
 * Finds users with a role that has the specified permission and sends them a notification.
 *
 * @param permissionName - The name of the permission to check for.
 * @param title - The title of the notification.
 * @param message - The message of the notification.
 * @param type - The type of the notification.
 * @param link - Optional link associated with the notification.
 */
export async function notifyUsersWithPermission(
  permissionName: string,
  title: string,
  message: string,
  type: NotificationType,
  link?: string
): Promise<void> {
  try {
    const users = await models.user.findAll({
      include: [
        {
          model: models.role,
          as: "role",
          include: [
            {
              model: models.rolePermission,
              as: "rolePermissions",
              where: {
                "$role.rolePermission.permission.name$": permissionName,
              },
              include: [
                {
                  model: models.permission,
                  as: "permission",
                  required: true,
                },
              ],
            },
          ],
          required: true,
        },
      ],
      attributes: ["id"],
    });

    // Loop through the users and send them notifications
    const notificationPromises = users.map((user) =>
      saveNotification(user.id, title, message, type, link)
    );

    // Wait for all notifications to be sent
    await Promise.all(notificationPromises);
  } catch (error) {
    console.error("Error notifying users with permission:", error);
  }
}

/**
 * Create a new notification and send it to the user.
 *
 * @param {string} userId - The ID of the user to send the notification to.
 * @param {string} type - The type of notification (SECURITY, SYSTEM, ACTIVITY).
 * @param {string} title - The title of the notification.
 * @param {string} message - The message of the notification.
 * @param {string} [link] - Optional link associated with the notification.
 * @param {string} [icon] - Optional icon associated with the notification.
 */
export const handleNotification = async ({
  userId,
  type,
  title,
  message,
  link,
  icon,
}: {
  userId: string;
  type: "SECURITY" | "SYSTEM" | "ACTIVITY";
  title: string;
  message: string;
  link?: string;
  icon?: string;
}) => {
  try {
    const task = async () => {
      // Create the notification in the database
      const notification = await models.notification.create({
        userId,
        type,
        title,
        message,
        link,
        icon,
      });

      // Send the notification to the user
      await handleClientMessage({
        type: "notifications",
        method: "create",
        clientId: userId,
        data: notification.get({ plain: true }),
      });
    };

    await taskQueue.add(task);
  } catch (error) {
    console.error(`Failed to create and send notification: ${error}`);
  }
};
