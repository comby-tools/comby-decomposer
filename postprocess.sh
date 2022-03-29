#!/bin/bash

cd templates
# DELETE LARGE FILES
ls | xargs du -hs | sort -h -r | grep "8.0K\|12K\|16K\|20K\|24K\|28K" | awk '{print $2}' | xargs -L 1 -I % rm %

# DELETE FILES WITH TOO MANY HOLES
grep ":\[11\]" * -l | xargs -L 1 -I % rm %

# DELETE FILES WITH NO HOLES
grep ":\[1\]" * -L | xargs -L 1 -I % rm %
cd ..

############################################################################################################

cd fragments

# DELETE LARGE FILES
ls | xargs du -hs | sort -h -r | grep "8.0K\|12K\|16K\|20K\|24K\|28K" | awk '{print $2}' | xargs -L 1 -I % rm %

cd ..
