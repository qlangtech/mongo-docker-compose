
// init-mongo.js

// ============== 1. 初始化副本集 ==============
print("Initializing replica set rs0...");

try {
  // rs.initiate() 只需要在 PRIMARY 上执行一次
  rs.initiate({
    _id: "rs0",
    members: [
      { _id: 0, host: "mongodb:27017" } // 使用 Docker 服务名
    ]
  });

  // 等待当前节点成为 PRIMARY
  let status;
  const maxAttempts = 20;
  const intervalMs = 2000;

 for (let i = 0; i < maxAttempts; i++) {
  try {
    status = rs.status();
    // 检查 status 是否有效且 myState 存在
    if (status && status.myState !== undefined) {
      if (status.myState === 1) {
        print("This node is now PRIMARY.");
        break; // 成功，跳出循环
      } else if (status.myState === 2) {
        print(`Attempt ${i + 1}/${maxAttempts}: This node is SECONDARY. Waiting...`);
      } else {
        print(`Attempt ${i + 1}/${maxAttempts}: Current state is ${status.myState}. Waiting...`);
      }
    } else {
      print(`Attempt ${i + 1}/${maxAttempts}: rs.status() returned invalid or incomplete status. Waiting...`);
    }
  } catch (statusError) {
    // rs.status() 本身也可能因为各种原因失败（如网络问题、节点未完全启动）
    print(`Attempt ${i + 1}/${maxAttempts}: Failed to get replica set status: ${statusError}. Waiting...`);
  }
  
  // 只有在不是最后一次尝试时才 sleep
  if (i < maxAttempts - 1) {
    sleep(intervalMs);
  }
}

  if (!status || status.myState !== 1) {
    print("Failed to establish PRIMARY within the timeout period.");
    exit(1);
  } else {
    print("Replica set PRIMARY established successfully.");
  }

} catch (error) {
  // 如果副本集已经初始化过，rs.initiate() 会抛出异常
  print("Replica set initialization result:", error);
  // 检查是否已经存在 PRIMARY
  status = rs.status();
  if (status && status.myState === 1) {
    print("Replica set is already PRIMARY.");
  } else {
    print("Replica set is not PRIMARY. Status:", JSON.stringify(status, null, 2));
    exit(1);
  }
}

// ============== 2. 创建测试数据库和 CDC 用户 ==============
print("Creating test database and CDC user...");

try {
  // 切换到 testdb 数据库并创建集合
  const testDb = db.getSiblingDB("tis");
  testDb.createCollection("test_collection");
  print("Collection 'test_collection' created in database 'tis'.");

  // 切换到 admin 数据库创建用户
  const adminDb = db.getSiblingDB("admin");

  // 检查用户是否已存在，如果存在则先删除（可选，用于幂等性）
  // const userExists = adminDb.getUser("cdc_user");
  // if (userExists) {
  //   print("User 'cdc_user' already exists. Dropping...");
  //   adminDb.dropUser("cdc_user");
  // }

  adminDb.createUser({
    user: "cdc_user",
    pwd: "cdc_password",
    roles: [
      { role: "read", db: "tis" },       // 读取源数据库
      { role: "read", db: "local" }         // 读取 oplog
    ]
  });
  print("User 'cdc_user' created with read roles on 'tis' and 'local'.");

} catch (error) {
  print("Error during database/user setup:", error);
  exit(1);
}

print("MongoDB initialization with keyFile completed successfully.");
// 保持容器运行（可选，如果需要交互式调试）
// tail -f /dev/null 在 mongosh 脚本中不适用
