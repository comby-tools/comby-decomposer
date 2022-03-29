import sys
import json
import uuid

# python extract.py <dir-name> <extension>
if __name__ == "__main__":
    for line in sys.stdin:
        try:
            m = json.loads(line)
        except:
            print("issue: {}".format(line))
            sys.exit(1)
        envs = [x['environment'] for x in m['matches']]
        for e in envs:
            for var in e:
                with open('{}/{}{}'.format(sys.argv[1], uuid.uuid4(), sys.argv[2]), 'w') as f:
                    f.write('{}\n'.format((var['value']).encode().decode('unicode_escape')))
