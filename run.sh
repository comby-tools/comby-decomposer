#!/bin/bash

if [ -z "$1" ]; then
  echo "Give file extension to extract like .go or .sol"
  exit 1
fi

if [ -z "$2" ]; then
  echo "Give file language parser like .go"
  exit 1
fi


ROOT=$(pwd)
COMBY=comby

# global names
SOURCES=$ROOT/sources
TEMPLATES=$ROOT/templates
FRAGMENTS=$ROOT/fragments

# temporary working directories and names.
EXTRACTED=$ROOT/extracted
EXTRACTED_FOR_FILE=extracted_for_file
FRAGMENTS_FOR_FILE=$ROOT/fragments_for_file

# patterns for extraction
EXTRACT_PATTERNS_DIR=$ROOT/extraction_specifications

EXTENSION="$1"
LANG="$2"
EXTRACTORS=`ls $EXTRACT_PATTERNS_DIR/*.toml`
PYTHON_EXTRACTOR=$ROOT/extract.py

rm -rf $TEMPLATES
mkdir -p $TEMPLATES

rm -rf $FRAGMENTS
mkdir -p $FRAGMENTS

rm -rf $EXTRACTED
mkdir -p $EXTRACTED

rm -rf $EXTRACTED_FOR_FILE
mkdir -p $EXTRACTED_FOR_FILE

rm -rf $FRAGMENTS_FOR_FILE
mkdir -p $FRAGMENTS_FOR_FILE

for s in `ls ${SOURCES}/*${EXTENSION}`; do
    echo -n $s

    ### extract concrete fragments for this file based on $EXTRACTORS ###

    for e in $EXTRACTORS; do
        echo -n " " $(basename $e) " "
        # write matches to $EXTRACTED_FOR_FILE
        $COMBY -sequential -config $e -d $SOURCES -f $s -matcher $LANG -json-lines -match-only \
            | python $PYTHON_EXTRACTOR $EXTRACTED_FOR_FILE $EXTENSION
    done

    echo

    # if there is an arg to this script, then nest.

    if [ ! -z "$1" ]; then
        MAX_DEPTH=10

        for i in `seq 1 "$MAX_DEPTH"`; do
            cd $EXTRACTED_FOR_FILE
            mkdir $EXTRACTED_FOR_FILE
            echo -n " " $i " "
            for e in $EXTRACTORS; do
                $COMBY -sequential -config $e -f $EXTENSION -matcher $LANG -json-lines -match-only \
                    | python $PYTHON_EXTRACTOR $EXTRACTED_FOR_FILE $EXTENSION
            done
            if [ -z "$(ls -A -- $EXTRACTED_FOR_FILE)" ]; then
                echo 'Nothing generated, stopping'
                rm -rf $EXTRACTED_FOR_FILE
                break
            fi
        done
    else
        echo -n "... skipping nesting ..."
    fi

    cd $ROOT

    find $EXTRACTED_FOR_FILE -name "*${EXTENSION}" -exec cp -n {} $FRAGMENTS \; # save the concrete fragments for this file in the global corpus

    ### templatizing ###
    echo -n "... templatizing ..."

    # flatten extracted and dedupe everything for this file.
    find $EXTRACTED_FOR_FILE -name "*${EXTENSION}" -exec cp -n {} $FRAGMENTS_FOR_FILE \;
    fdupes -dN $FRAGMENTS_FOR_FILE &> /dev/null

    echo ":[:[id()]]" > $FRAGMENTS_FOR_FILE/rewrite

    for c in `ls ${FRAGMENTS_FOR_FILE}/*${EXTENSION}`; do
        cp $c $FRAGMENTS_FOR_FILE/match
        SOURCE_NAME=$(basename $s)
        FRAGMENT_NAME=$(basename $c)
        $COMBY -sequential -matcher $LANG -f $s -templates $FRAGMENTS_FOR_FILE -stdout > $TEMPLATES/${SOURCE_NAME%.*}.${FRAGMENT_NAME%.*}.template${EXTENSION}
    done

    cp $s $TEMPLATES/$SOURCE_NAME.delete.me.123  # temporarily include the source file as a template for deduping processing all files

    ###

    # we're done with this file
    rm -rf $FRAGMENTS_FOR_FILE
    rm -rf $EXTRACTED_FOR_FILE
    mkdir -p $EXTRACTED_FOR_FILE
    mkdir -p $FRAGMENTS_FOR_FILE

    echo
done

rm -rf $FRAGMENTS_FOR_FILE
rm -rf $EXTRACTED_FOR_FILE
rm -rf $EXTRACTED

# strip comments and dedup templates (had no holes, wasn't templatized).
$COMBY -matcher .txt '//:[x\n]' '' -d $TEMPLATES $EXTENSION -i
fdupes -dN $TEMPLATES &> /dev/null
find $TEMPLATES -name "*.delete.me.123" -exec rm {} \;

# dedup concrete fragments (for files that share fragments).
$COMBY -matcher .txt '//:[x\n]' '' -d $FRAGMENTS $EXTENSION -i
fdupes -dN $FRAGMENTS &> /dev/null
echo "-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-"
echo "Extracted this many total concrete fragments:"
ls $FRAGMENTS | wc -l
