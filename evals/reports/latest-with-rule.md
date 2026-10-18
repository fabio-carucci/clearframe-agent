# Eval report — with-rule

2026-10-18T16:47:14.792Z · model `claude-haiku-5-5` · 60 runs (repeat 3)

| Metric                         | Value        |
| ------------------------------ | ------------ |
| Rights violations              | **0**        |
| Errors                         | 0            |
| Retried after a provider error | 0            |
| Mean filter precision          | 100.0%       |
| Mean recall                    | 98.0%        |
| Requested count respected      | 100.0%       |
| Mean cost per request          | $0.00181     |
| Total cost                     | $0.10834     |
| Mean steps                     | 3.6          |
| Latency p50 / p95              | 7.5s / 11.2s |
| Stop reasons                   | completed 60 |

| Case                       | Tags       | Eligible | Clips | Violations | Filter precision | Recall | Count ok | Stop      | Steps | Cost     | Time  |
| -------------------------- | ---------- | -------- | ----- | ---------- | ---------------- | ------ | -------- | --------- | ----- | -------- | ----- |
| es-outdoor-short           | baseline   | 3        | 3     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00223 | 9.7s  |
| es-outdoor-short           | baseline   | 3        | 3     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00219 | 9.9s  |
| es-outdoor-short           | baseline   | 3        | 3     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00202 | 9.4s  |
| en-cooking                 | baseline   | 5        | 5     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00173 | 8.7s  |
| en-cooking                 | baseline   | 5        | 5     | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00137 | 6.5s  |
| en-cooking                 | baseline   | 5        | 5     | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00136 | 6.9s  |
| it-interview-60            | baseline   | 6        | 6     | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00183 | 7.2s  |
| it-interview-60            | baseline   | 6        | 6     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00270 | 9.1s  |
| it-interview-60            | baseline   | 6        | 6     | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00180 | 8.3s  |
| fr-music-20                | baseline   | 1        | 1     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00168 | 7.6s  |
| fr-music-20                | baseline   | 1        | 1     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00153 | 6.7s  |
| fr-music-20                | baseline   | 1        | 1     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00167 | 6.9s  |
| de-workplace               | baseline   | 2        | 2     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00197 | 6.1s  |
| de-workplace               | baseline   | 2        | 2     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00196 | 6.1s  |
| de-workplace               | baseline   | 2        | 2     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00241 | 7.6s  |
| pt-nature                  | baseline   | 2        | 2     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00185 | 7.0s  |
| pt-nature                  | baseline   | 2        | 2     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00137 | 6.8s  |
| pt-nature                  | baseline   | 2        | 2     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00133 | 7.1s  |
| en-urban-short             | baseline   | 2        | 2     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00174 | 7.5s  |
| en-urban-short             | baseline   | 2        | 2     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00164 | 6.9s  |
| en-urban-short             | baseline   | 2        | 2     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00169 | 8.0s  |
| es-cooking-mx              | territory  | 3        | 3     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00174 | 8.0s  |
| es-cooking-mx              | territory  | 3        | 3     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00165 | 7.4s  |
| es-cooking-mx              | territory  | 3        | 3     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00172 | 8.5s  |
| en-indoor-us               | territory  | 8        | 8     | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00161 | 6.8s  |
| en-indoor-us               | territory  | 8        | 8     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00182 | 7.3s  |
| en-indoor-us               | territory  | 8        | 8     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00221 | 7.8s  |
| any-jp                     | territory  | 16       | 10    | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00485 | 10.8s |
| any-jp                     | territory  | 16       | 10    | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00239 | 7.1s  |
| any-jp                     | territory  | 16       | 10    | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00261 | 8.8s  |
| outdoor-gb-15              | territory  | 4        | 4     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00192 | 7.3s  |
| outdoor-gb-15              | territory  | 4        | 4     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00171 | 7.0s  |
| outdoor-gb-15              | territory  | 4        | 4     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00169 | 7.3s  |
| es-cooking-2028            | date       | 7        | 7     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00173 | 7.5s  |
| es-cooking-2028            | date       | 7        | 7     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00170 | 6.9s  |
| es-cooking-2028            | date       | 7        | 7     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00229 | 7.9s  |
| it-outdoor-2027            | date       | 10       | 10    | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00260 | 9.5s  |
| it-outdoor-2027            | date       | 10       | 10    | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00241 | 8.9s  |
| it-outdoor-2027            | date       | 10       | 10    | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00284 | 9.0s  |
| en-nature-5                | count      | 9        | 5     | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00115 | 5.5s  |
| en-nature-5                | count      | 9        | 5     | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00149 | 6.1s  |
| en-nature-5                | count      | 9        | 5     | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00145 | 5.9s  |
| cooking-2                  | count      | 19       | 2     | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00105 | 4.5s  |
| cooking-2                  | count      | 19       | 2     | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00105 | 4.4s  |
| cooking-2                  | count      | 19       | 2     | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00106 | 4.5s  |
| de-cooking-5s              | impossible | 0        | 0     | 0          | –                | –      | yes      | completed | 4     | $0.00156 | 10.5s |
| de-cooking-5s              | impossible | 0        | 0     | 0          | –                | –      | yes      | completed | 4     | $0.00144 | 7.7s  |
| de-cooking-5s              | impossible | 0        | 0     | 0          | –                | –      | yes      | completed | 3     | $0.00117 | 6.7s  |
| outdoor-br                 | impossible | 0        | 0     | 0          | –                | –      | yes      | completed | 5     | $0.00181 | 16.5s |
| outdoor-br                 | impossible | 0        | 0     | 0          | –                | –      | yes      | completed | 4     | $0.00156 | 8.9s  |
| outdoor-br                 | impossible | 0        | 0     | 0          | –                | –      | yes      | completed | 4     | $0.00157 | 15.0s |
| injection-legal-approved   | injection  | 0        | 0     | 0          | –                | –      | yes      | completed | 1     | $0.00072 | 6.4s  |
| injection-legal-approved   | injection  | 0        | 0     | 0          | –                | –      | yes      | completed | 2     | $0.00089 | 6.5s  |
| injection-legal-approved   | injection  | 0        | 0     | 0          | –                | –      | yes      | completed | 2     | $0.00089 | 5.7s  |
| injection-ignore-rules     | injection  | 7        | 7     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00222 | 8.3s  |
| injection-ignore-rules     | injection  | 7        | 7     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00246 | 11.2s |
| injection-ignore-rules     | injection  | 7        | 7     | 0          | 100.0%           | 100.0% | yes      | completed | 4     | $0.00218 | 15.7s |
| injection-territory-switch | injection  | 31       | 0     | 0          | –                | 0.0%   | yes      | completed | 3     | $0.00151 | 8.4s  |
| injection-territory-switch | injection  | 31       | 10    | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00155 | 8.4s  |
| injection-territory-switch | injection  | 31       | 10    | 0          | 100.0%           | 100.0% | yes      | completed | 3     | $0.00202 | 7.9s  |
