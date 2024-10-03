import { fromBigInt } from "../blockchain";
import client from "./client";

interface FetchParams {
  query: {
    page?: number;
    perPage?: number;
    sortOrder?: string;
  };
  sortField?: string;
  excludeFields?: string[];
}

export async function getPaginatedRecords({
  table,
  query,
  sortField = "createdAt",
  excludeFields = [],
}: {
  table: string;
} & FetchParams): Promise<{ items: any[]; pagination: any }> {
  const page = Number(query.page) || 1;
  const perPage = Number(query.perPage) || 10;

  // Fetch the total number of records to calculate totalPages
  const countQueryStr = `SELECT COUNT(*) FROM ${table};`;

  const countResult = await client.execute(countQueryStr, [], {
    prepare: true,
  });
  const totalItems = countResult.rows[0].count;
  const totalPages = Math.ceil(totalItems / perPage);

  const queryStr = `
    SELECT ${getSelectFields(excludeFields)}
    FROM ${table}
    LIMIT ${perPage};
  `;

  try {
    const result = await client.execute(queryStr, [], {
      prepare: true,
    });

    // Determine the type of sortField and sort accordingly
    const sortedRows = result.rows
      .sort((a, b) => {
        const fieldA = a[sortField];
        const fieldB = b[sortField];

        if (typeof fieldA === "number" && typeof fieldB === "number") {
          return query.sortOrder === "asc" ? fieldA - fieldB : fieldB - fieldA;
        }

        if (typeof fieldA === "string" && typeof fieldB === "string") {
          return query.sortOrder === "asc"
            ? fieldA.localeCompare(fieldB)
            : fieldB.localeCompare(fieldA);
        }

        if (fieldA instanceof Date && fieldB instanceof Date) {
          return query.sortOrder === "asc"
            ? fieldA.getTime() - fieldB.getTime()
            : fieldB.getTime() - fieldA.getTime();
        }

        if (!isNaN(Date.parse(fieldA)) && !isNaN(Date.parse(fieldB))) {
          const dateA = new Date(fieldA);
          const dateB = new Date(fieldB);
          return query.sortOrder === "asc"
            ? dateA.getTime() - dateB.getTime()
            : dateB.getTime() - dateA.getTime();
        }

        return 0; // default case if types do not match or are not recognized
      })
      .map((order) => ({
        ...order,
        amount: fromBigInt(order.amount),
        price: fromBigInt(order.price),
        cost: fromBigInt(order.cost),
        fee: fromBigInt(order.fee),
        filled: fromBigInt(order.filled),
        remaining: fromBigInt(order.remaining),
      }));

    return {
      items: sortedRows,
      pagination: {
        totalItems,
        currentPage: page,
        perPage,
        totalPages,
      },
    };
  } catch (error) {
    console.error(`Failed to fetch paginated data: ${error.message}`);
    throw new Error(`Failed to fetch paginated data: ${error.message}`);
  }
}

function getSelectFields(excludeFields: string[]): string {
  if (excludeFields.length === 0) {
    return "*";
  }
  return `* EXCEPT(${excludeFields.join(", ")})`;
}
