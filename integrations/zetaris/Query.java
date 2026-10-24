import java.sql.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Read-only single-query bridge. Credentials stay in environment, query in stdin. */
public class Query {
  static String env(String key) {
    String value = System.getenv(key);
    if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing environment variable: " + key);
    return value;
  }
  static String json(String text) {
    StringBuilder out = new StringBuilder("\"");
    for (char c : text.toCharArray()) {
      switch(c) {
        case '"': out.append("\\\""); break;
        case '\\': out.append("\\\\"); break;
        case '\n': out.append("\\n"); break;
        case '\r': out.append("\\r"); break;
        case '\t': out.append("\\t"); break;
        default: if(c < 32) out.append(String.format("\\u%04x", (int)c)); else out.append(c);
      }
    }
    return out.append('"').toString();
  }
  public static void main(String[] args) {
    try {
      String query = new String(System.in.readAllBytes(), StandardCharsets.UTF_8).trim();
      // No arbitrary LLM SQL: application uses fixed SELECT templates only.
      if (!query.matches("(?is)^SELECT\\s+[^;]+$")) throw new IllegalArgumentException("Only a single SELECT without semicolons is accepted");
      Class.forName("com.zetaris.lightning.jdbc.LightningDriver");
      String url = env("ZETARIS_JDBC_URL");
      if (!url.startsWith("jdbc:zetaris:lightning@localhost:") && !url.startsWith("jdbc:zetaris:lightning@127.0.0.1:")) throw new IllegalArgumentException("This bridge requires a loopback Zetaris endpoint");
      try (Connection connection = DriverManager.getConnection(url, env("ZETARIS_USER"), env("ZETARIS_PASSWORD"));
           Statement statement = connection.createStatement()) {
        statement.setMaxRows(1001);
        try (ResultSet result = statement.executeQuery(query)) {
          ResultSetMetaData meta = result.getMetaData();
          StringBuilder out = new StringBuilder("[");
          int count = 0;
          while(result.next()) {
            if(++count > 1000) throw new IllegalStateException("More than 1000 rows: implement bounded pagination before proceeding");
            if(count > 1) out.append(','); out.append('{');
            for(int col=1; col<=meta.getColumnCount(); col++) {
              if(col>1) out.append(',');
              Object value=result.getObject(col);
              out.append(json(meta.getColumnLabel(col))).append(':');
              out.append(value == null ? "null" : value instanceof Number || value instanceof Boolean ? value.toString() : json(value.toString()));
            }
            out.append('}');
          }
          System.out.println(out.append(']'));
        }
      }
    } catch (Exception error) {
      // Driver exceptions can contain connection details. Avoid echoing them.
      System.err.println("Zetaris query failed (" + error.getClass().getSimpleName() + "). Check driver, connection, credentials and schema locally.");
      System.exit(1);
    }
  }
}
