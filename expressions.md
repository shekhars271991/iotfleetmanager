# Expressions

Aerospike expressions are a specialized, strictly typed, functional language. They are designed specifically for manipulating and comparing data fields (bins) and record metadata.

Because they are intentionally non-Turing complete, meaning they cannot perform all possible computations that a universal Turing machine could, they can’t handle complex features like iteration or recursion, which ensures their execution remains fast and predictable.

Expressions are used for several key purposes:

-   Filter records: Select which records to read or process.
-   Control operations: Determine if a record operation (like a write) should proceed.
-   XDR filtering: Filter which data gets replicated to remote datacenters (DCs).
-   Extend transactions: Add custom logic and functionality to database transactions.

## Types of expressions

Aerospike supports four types of expressions:

-   Secondary index expressions introduced in Database 8.1.0
-   Operation expressions introduced in Database 5.6.0
-   XDR filter expressions introduced in Database 5.3.0
-   Record filter expressions introduced in Database 5.2.0

### Secondary index expression

A [secondary index](https://aerospike.com/docs/database/learn/architecture/data-storage/secondary-index) can index either the value of a specific bin or the computed value of an expression. When indexing very large data sets, you can create more memory-efficient secondary indexes by indexing on the computed value of an expression rather than bin data.

Use the Aerospike admin tool, [`asadm`](https://aerospike.com/docs/database/tools/asadm/live-mode/#create-a-secondary-index), to create secondary indexes. [Queries](https://aerospike.com/docs/develop/learn/queries/secondary-index/) can use an expression index either by matching the expression used by the index, or by referring to the index name in a predicate.

### Operation expressions

Operation expressions are a type of bin operation designed to quickly and atomically calculate a value.

-   These values are computed using either information already in the record or data provided by the expression itself.
-   The result is either returned to the client (for read expressions) or written to a specified bin (for write expressions).

Operation expressions allow for atomic, cross-bin operations. This means they complete entirely or not at all across multiple data fields.

### Filter XDR records with expressions

With Aerospike, you can filter records before they are sent to remote destinations using XDR (Cross-Datacenter Replication).

These XDR filters are dynamic and must be defined uniquely for each namespace going to a specific destination datacenter (DC).

You have two main ways to set these filter expressions:

**Using the info command**: Execute the command xdr-set-filter.

**Programmatically**: Use the appropriate client API in your application code.

XDR filtering reduces the volume of data that you replicate. When you reduce the volume of replicated data, you also:

-   Reduce network traffic.
-   Reduce storage and processing requirements at destination datacenters, which avoids the costs of overprovisioning, most significantly in hub-and-spoke XDR topologies.
-   Reduce the cost of moving data across or from public clouds.

### Record filtering with expressions

Record filtering selects only the records that satisfy a boolean expression, meaning the expression must evaluate to `true`.

#### Supported functions

Record filter expressions are powerful because they support a wide range of functions, including:

-   A variety of metadata functions.
-   All applicable data type functions, such as:
    -   The full List and Map APIs (even in a nested context).
    -   Bitwise functions for binary data (blobs).
    -   Geo-spatial queries for GeoJSON data.
    -   HyperLogLog (HLL) functions.

#### Execution timing

Filter expressions are only executed when the record already exists in the database. They will not execute if a read operation fails to find the record, or if a write operation is creating a new record.

You can use filters with the following single record commands:

-   [`read`](https://github.com/aerospike/aerospike-client-java/blob/master/client/src/com/aerospike/client/BatchRead.java)
-   [`write`](https://github.com/aerospike/aerospike-client-java/blob/master/client/src/com/aerospike/client/BatchWrite.java)
-   [`record UDFs`](https://github.com/aerospike/aerospike-client-java/blob/master/client/src/com/aerospike/client/BatchUDF.java)
-   [`delete`](https://github.com/aerospike/aerospike-client-java/blob/master/client/src/com/aerospike/client/BatchDelete.java)
-   [transactions](https://aerospike.com/docs/database/learn/architecture/transactions/)
-   [batched commands](https://aerospike.com/docs/develop/learn/batch/)
-   [primary index queries (FKA scans)](https://aerospike.com/docs/develop/learn/queries/primary-index/)
-   [secondary index queries](https://aerospike.com/docs/develop/learn/queries/secondary-index/)

## Syntax and behavior

Aerospike expressions use Polish Notation (PN) syntax and have strict typing, which broadens the criteria you can use to select specific records.

### Key rules

-   Immutability: All data within an expression is immutable (cannot be changed).
    
-   Bin modifications: If an expression performs modifications to a bin, those changes operate on a temporary copy and are not saved to the actual bin once the expression finishes.
    
-   Conditional logic but no iteration: Expressions do support conditional branching via the `cond` operator. However, the expression system does not support loops, iteration, or recursion, and therefore cannot perform general control-flow constructs such as repeated evaluation. If performed as an expressions write operation, the final result of the expressions is stored to the target bin.
    

This means expressions are designed for fast, single-pass evaluation without persistent state changes or complex control flow within the evaluation logic itself.

### Types

The _type system_ is divided into two primary type classes: value and bin.

#### Type usage and naming conventions

Expressions return either a value expression or a bin expression. Parameters used in expression functions follow the naming types below.

| Parameter name | Accepts | Alias | Notes |
| --- | --- | --- | --- |
| `t_value` | Only value expressions |  | Represents an expression that evaluates to a value. This is always an expression type and not a language-specific value type. |
| `t_bin_expr` | Only bin expressions | bin\_expr | Represents an expression that operates on or references a bin. |
| `t_expr` | Either bin or value expressions | expr | Used when a parameter may accept either type of expression. |
| library\_specific | Not an expression type. A type that varies by language implementation. |  | This is not interchangeable with `t_value`. It refers to a concrete type defined by the client library, which may differ across languages. |

#### Supported value subtypes (t or `t_value`)

The prefix t\_ (as in `t_value`, `t_bin_expr`, `t_expr`) refers to the following concrete value subtypes:

-   nil: value for null.
-   boolean: value-only type that can be `true` or `false`.
-   integer: 64-bit signed integer.
-   float: 64-bit floating-point number.
-   blob: binary data.
-   string: UTF-8 encoded string.
-   geojson: GeoJSON format.
-   list: CDT List (Complex Data Type List).
-   map: CDT Map (Complex Data Type Map).
-   hll: HyperLogLog structure.
-   AUTO: Used when some libraries implement type inference for certain single-result CDT read expressions, allowing the expr\_type to be deduced from the result\_type.

## Execution model

Metadata resolution is critical for the performance of Aerospike expressions. Since metadata is stored in the primary index and doesn’t require loading data from disk for namespaces with data on disk, expressions that can be entirely processed using only this metadata can avoid disk access.

This ability to forgo disk operations yields a significant performance improvement—an order of magnitude gain. Aerospike expressions achieve this efficiency using a two-phase execution model. When an expression’s logic for a specific operation can be satisfied only with metadata, the system executes it that way, resulting in major speed enhancements.

**Phase 1: Metadata check (fast path)**

This phase starts by trying to resolve the expression using only the metadata stored in the primary index, which is very fast and avoids disk access.

**Storage Data is unknown**: During this phase, any expression that tries to read the actual stored data evaluates as unknown.

**Trilean Logic**: Most expressions output unknown if their input is unknown, except for logical expressions which use trilean logic (`true`, `false`, or `unknown`) and can sometimes return a definite answer.

**Outcomes**:

-   If the result is `false`, the record is immediately filtered out, and no storage is accessed.
-   If the result is `true`, the operation proceeds, but storage is only accessed if absolutely necessary for the ongoing operation.
-   If the result is `unknown`, the system moves to Phase 2.

**Phase 2: Storage-data access**

This phase is executed only if the first phase failed to produce a definite `true` or `false` answer.

**Data Load**: The system loads the full record, incurring physical I/O if the data resides on disk. **Re-execution**: The expression is executed a second time. **Definitive result**: This phase always resolves the expression to a definite `true` or `false` answer.

This two-phase approach ensures that expressions only proceed to the slower disk-access phase when the outcome absolutely depends on the actual stored data.