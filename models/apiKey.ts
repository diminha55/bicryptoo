import * as Sequelize from "sequelize";
import { DataTypes, Model, Optional } from "sequelize";
import type { user, userId } from "./user";

export interface apiKeyAttributes {
  id: string;
  userId: string;
  key: string;
  createdAt?: Date;
  deletedAt?: Date;
  updatedAt?: Date;
}

export type apiKeyPk = "id";
export type apiKeyId = apiKey[apiKeyPk];
export type apiKeyOptionalAttributes =
  | "id"
  | "createdAt"
  | "deletedAt"
  | "updatedAt";
export type apiKeyCreationAttributes = Optional<
  apiKeyAttributes,
  apiKeyOptionalAttributes
>;

export class apiKey
  extends Model<apiKeyAttributes, apiKeyCreationAttributes>
  implements apiKeyAttributes
{
  id!: string;
  userId!: string;
  key!: string;
  createdAt?: Date;
  deletedAt?: Date;
  updatedAt?: Date;

  // apiKey belongsTo user via userId
  user!: user;
  getUser!: Sequelize.BelongsToGetAssociationMixin<user>;
  setUser!: Sequelize.BelongsToSetAssociationMixin<user, userId>;
  createUser!: Sequelize.BelongsToCreateAssociationMixin<user>;

  static initModel(sequelize: Sequelize.Sequelize): typeof apiKey {
    return apiKey.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          validate: {
            notNull: { msg: "userId: User ID cannot be null" },
            isUUID: { args: 4, msg: "userId: User ID must be a valid UUID" },
          },
        },
        key: {
          type: DataTypes.STRING(255),
          allowNull: false,
          validate: {
            notEmpty: { msg: "key: API key must not be empty" },
          },
        },
      },
      {
        sequelize,
        tableName: "api_key",
        timestamps: true,
        paranoid: true,
        indexes: [
          {
            name: "PRIMARY",
            unique: true,
            using: "BTREE",
            fields: [{ name: "id" }],
          },
          {
            name: "apiKeyUserIdIdx",
            using: "BTREE",
            fields: [{ name: "userId" }],
          },
        ],
      }
    );
  }
}
